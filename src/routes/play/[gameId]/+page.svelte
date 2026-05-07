<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/game.svelte';
	import { connectToGame, disconnect } from '$lib/signalr';
	import { playBuzzSound, playCoinSound, playRemoveSound } from '$lib/sounds';
	import confetti from 'canvas-confetti';

	const gameId = $derived(page.params.gameId);
	let participantId = $state('');
	let loading = $state(true);
	let error = $state('');
	let buzzing = $state(false);
	let unbuzzing = $state(false);
	let prevScore: number | null = null;
	let prevBuzzOrder: number | null = null;
	let fireConfetti: confetti.CreateTypes | null = null;
	let endConfettiFired = false;

	onMount(() => {
		fireConfetti = confetti.create(undefined, { useWorker: false, resize: true });
	});

	let myParticipant = $derived(
		gameStore.current?.participants.find((p) => p.participantId === participantId) ?? null
	);

	let canBuzz = $derived(
		gameStore.current?.status === 'active' &&
			myParticipant != null &&
			!myParticipant.buzzedIn &&
			!gameStore.buzzLimitReached
	);

	let canUnbuzz = $derived(
		gameStore.current?.status === 'active' && myParticipant != null && myParticipant.buzzedIn
	);

	// Final scores for the results screen
	let finalScores = $derived(
		gameStore.current?.finalScores ??
			(gameStore.current
				? [...gameStore.current.participants]
						.map((p) => ({ participantId: p.participantId, name: p.name, score: p.score }))
						.sort((a, b) => b.score - a.score)
				: [])
	);

	$effect(() => {
		const score = myParticipant?.score ?? 0;
		if (prevScore !== null) {
			if (score > prevScore) {
				playCoinSound();
				fireConfetti?.({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
			} else if (score < prevScore) {
				playRemoveSound();
			}
		}
		prevScore = score;
	});

	$effect(() => {
		const buzzOrder = myParticipant?.buzzOrder ?? 0;
		if (prevBuzzOrder !== null && prevBuzzOrder !== 1 && buzzOrder === 1) {
			playBuzzSound();
		}
		prevBuzzOrder = buzzOrder;
	});

	// Fire confetti when game ends (for the winner)
	$effect(() => {
		if (gameStore.current?.status === 'ended' && !endConfettiFired) {
			endConfettiFired = true;
			if (finalScores.length > 0 && finalScores[0].participantId === participantId) {
				// Winner gets big confetti
				fireConfetti?.({ particleCount: 200, spread: 100, origin: { y: 0.5 } });
				setTimeout(() => fireConfetti?.({ particleCount: 100, spread: 80, origin: { y: 0.4 } }), 500);
			} else {
				fireConfetti?.({ particleCount: 60, spread: 50, origin: { y: 0.6 } });
			}
		}
	});

	$effect(() => {
		const id = gameId;
		if (!id) return;
		let active = true;

		(async () => {
			participantId = localStorage.getItem(`participant-${id}`) ?? '';
			if (!participantId) {
				await goto('/');
				return;
			}

			try {
				const res = await fetch(`/api/games/${id}`);
				if (!res.ok) throw new Error('Game not found');
				const data = await res.json();
				if (!active) return;
				gameStore.set(data);
			} catch {
				if (!active) return;
				error = 'Could not load game. It may have expired.';
				loading = false;
				return;
			}

			if (!active) return;
			loading = false;

			connectToGame(id, participantId, (target, args) => {
				gameStore.handleMessage(target, args);
			}).catch((e) => {
				console.warn('SignalR connection failed:', e);
			});
		})();

		return () => {
			active = false;
			disconnect();
		};
	});

	async function buzz() {
		if (!canBuzz || buzzing) return;
		buzzing = true;
		try {
			await fetch(`/api/games/${gameId}/buzz`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ participantId })
			});
		} catch {
			// Silently ignore — UI will update via SignalR
		} finally {
			buzzing = false;
		}
	}

	async function unbuzz() {
		if (!canUnbuzz || unbuzzing) return;
		unbuzzing = true;
		try {
			await fetch(`/api/games/${gameId}/unbuzz`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ participantId })
			});
		} catch {
			// Silently ignore — UI will update via SignalR
		} finally {
			unbuzzing = false;
		}
	}

	const medals = ['🥇', '🥈', '🥉'];
</script>

<svelte:head>
	<title>{gameStore.current?.gameName ?? 'buzzin'}</title>
</svelte:head>

<main class="page" style="justify-content:space-between;">
	{#if loading}
		<div style="flex:1; display:flex; align-items:center; justify-content:center;">
			<p class="text-muted">Connecting…</p>
		</div>

	{:else if error}
		<div class="card animate-in" style="margin:auto;">
			<p style="color:var(--danger); text-align:center;">{error}</p>
			<a href="/" class="btn btn-secondary" style="margin-top:12px; text-decoration:none;">← Home</a>
		</div>

	{:else if gameStore.current}
		{@const game = gameStore.current}

		{#if game.status === 'ended'}
			<!-- Final Results Screen -->
			<div class="results-container animate-in">
				<h1 class="results-title">🎉 Game Over!</h1>
				<p class="results-subtitle">{game.gameName}</p>

				<!-- Podium -->
				{#if finalScores.length > 0}
					<div class="podium">
						{#if finalScores[1]}
							<div class="podium-place second animate-in">
								<div class="podium-medal">{medals[1]}</div>
								<div class="podium-name">{finalScores[1].name}</div>
								<div class="podium-score">{finalScores[1].score} pts</div>
								<div class="podium-block second-block">2</div>
							</div>
						{/if}
						{#if finalScores[0]}
							<div class="podium-place first animate-in">
								<div class="podium-medal">{medals[0]}</div>
								<div class="podium-name">{finalScores[0].name}</div>
								<div class="podium-score">{finalScores[0].score} pts</div>
								<div class="podium-block first-block">1</div>
							</div>
						{/if}
						{#if finalScores[2]}
							<div class="podium-place third animate-in">
								<div class="podium-medal">{medals[2]}</div>
								<div class="podium-name">{finalScores[2].name}</div>
								<div class="podium-score">{finalScores[2].score} pts</div>
								<div class="podium-block third-block">3</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Full leaderboard -->
				{#if finalScores.length > 3}
					<div class="results-leaderboard">
						{#each finalScores.slice(3) as p, i (p.participantId)}
							<div class="results-row">
								<span class="results-rank">{i + 4}th</span>
								<span class="results-name">{p.name}</span>
								<span class="results-score">{p.score} pts</span>
							</div>
						{/each}
					</div>
				{/if}

				<a href="/" class="btn btn-primary" style="margin-top:24px; text-decoration:none; max-width:300px; width:100%;">
					← Back to Home
				</a>
			</div>
		{:else}

		<!-- Top bar -->
		<div style="
			width: 100%;
			max-width: 480px;
			display: grid;
			grid-template-columns: 1fr auto;
			align-items: center;
			gap: 12px;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius);
			padding: 10px 16px;
		">
			<div style="min-width:0;">
				<div style="font-size:0.65rem; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Game</div>
				<div style="font-weight:700; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{game.gameName}</div>
			</div>
			<div style="display:flex; align-items:stretch; gap:12px;">
				<div style="width:1px; background:var(--border);"></div>
				<div style="text-align:center; min-width:48px;">
					<div style="font-size:0.65rem; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Player</div>
					<div style="font-weight:600; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px;">{myParticipant?.name ?? ''}</div>
				</div>
				<div style="width:1px; background:var(--border);"></div>
				<div style="text-align:center; min-width:40px;">
					<div style="font-size:0.65rem; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Score</div>
					<div style="font-size:1.3rem; font-weight:800; color: var(--success); line-height:1;">{myParticipant?.score ?? 0}</div>
				</div>
				<div style="width:1px; background:var(--border);"></div>
				<div style="display:flex; align-items:center;">
					<a href="/" title="Leave game" aria-label="Leave game" class="leave-btn">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
							<polyline points="16 17 21 12 16 7"/>
							<line x1="21" y1="12" x2="9" y2="12"/>
						</svg>
					</a>
				</div>
			</div>
		</div>

		<!-- Buzzer area -->
		<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px;">

			<!-- Status text -->
			{#if game.status === 'waiting'}
				<p class="text-muted animate-in" style="font-size:1rem; text-align:center; min-height:1.5em;">
					Waiting for moderator to start…
				</p>
			{:else if myParticipant?.buzzedIn}
				<p class="text-muted animate-in" style="font-size:1rem; text-align:center; min-height:1.5em;">
					Tap to retract your buzz
				</p>
			{:else if gameStore.buzzLimitReached}
				<p class="text-muted animate-in" style="font-size:1rem; text-align:center; min-height:1.5em; color:var(--danger);">
					Buzz limit reached (3/3)
				</p>
			{:else}
				<p class="text-muted animate-in" style="font-size:1rem; text-align:center; min-height:1.5em;">
					Ready — hit the buzzer!
				</p>
			{/if}

			<!-- THE BUZZER -->
			{#if myParticipant?.buzzedIn}
				<button
					class="buzzer {myParticipant.buzzOrder === 1 ? 'buzzed-first' : 'buzzed'}"
					onclick={unbuzz}
					disabled={!canUnbuzz || unbuzzing}
					aria-label="Unbuzz"
				>
					<span class="buzzer-icon">#{myParticipant.buzzOrder}</span>
				</button>
			{:else}
				<button
					class="buzzer"
					class:waiting={game.status === 'waiting'}
					class:buzz-locked={gameStore.buzzLimitReached && game.status === 'active'}
					onclick={buzz}
					disabled={!canBuzz || buzzing}
					aria-label="Buzz in"
				>
					<span class="buzzer-icon">
						{#if game.status === 'waiting'}
							⏳
						{:else if gameStore.buzzLimitReached}
							🔒
						{:else}
							🔔
						{/if}
					</span>
				</button>
			{/if}

		</div>

		<!-- Score strip -->
		{#if game.participants.length > 1}
			<div style="width:100%; max-width:480px; padding-bottom:8px;">
				<div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;">
					{#each [...game.participants].sort((a,b) => b.score - a.score) as p, i (p.participantId)}
						{@const medal = medals[i]}
						<div style="
							flex-shrink:0;
							background:var(--surface);
							border:1px solid {p.participantId === participantId ? 'var(--accent)' : 'var(--border)'};
							border-radius:var(--radius-sm);
							padding:8px 12px;
							text-align:center;
							min-width:80px;
						">
							<div style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70px;">
								{medal ?? `${i+1}th`}&nbsp;{p.name}
							</div>
							<div style="font-weight:700; font-size:1.1rem; color:{p.score > 0 ? 'var(--success)' : 'var(--text-muted)'};">{p.score}</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		{/if}
	{/if}
</main>

<style>
	.buzzer {
		width: min(72vw, 300px);
		height: min(72vw, 300px);
		border-radius: 50%;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		background: radial-gradient(circle at 38% 38%, #c084fc, #7c3aed 55%, #4c1d95);
		box-shadow:
			0 0 0 10px rgba(124, 58, 237, 0.15),
			0 24px 48px rgba(124, 58, 237, 0.4);
		transition: transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		animation: pulse-glow 2.5s ease-in-out infinite;
	}

	.buzzer:active:not(:disabled) {
		transform: scale(0.92);
		box-shadow:
			0 0 0 5px rgba(124, 58, 237, 0.2),
			0 12px 24px rgba(124, 58, 237, 0.3);
	}

	.buzzer:disabled:not(.buzzed):not(.buzzed-first) {
		background: radial-gradient(circle at 38% 38%, #4b5563, #374151);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		animation: none;
		cursor: not-allowed;
	}

	.buzzer.buzzed-first {
		background: radial-gradient(circle at 38% 38%, #4ade80, #16a34a 55%, #14532d);
		box-shadow:
			0 0 0 10px rgba(22, 163, 74, 0.15),
			0 24px 48px rgba(22, 163, 74, 0.4);
		animation: none;
	}

	.buzzer.buzzed {
		background: radial-gradient(circle at 38% 38%, #fb923c, #ea580c 55%, #9a3412);
		box-shadow:
			0 0 0 10px rgba(234, 88, 12, 0.15),
			0 24px 48px rgba(234, 88, 12, 0.4);
		animation: none;
	}

	.buzzer.waiting {
		background: radial-gradient(circle at 38% 38%, #64748b, #475569 55%, #334155);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		animation: none;
	}

	.buzzer.buzz-locked {
		background: radial-gradient(circle at 38% 38%, #4b5563, #374151);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		animation: none;
		cursor: not-allowed;
	}

	.buzzer-icon {
		font-size: min(22vw, 90px);
		font-weight: 900;
		color: #ffffff;
		pointer-events: none;
		user-select: none;
		text-shadow:
			0 2px 4px rgba(0, 0, 0, 0.6),
			0 4px 16px rgba(0, 0, 0, 0.4);
		letter-spacing: -0.02em;
	}

	@keyframes pulse-glow {
		0%, 100% {
			box-shadow:
				0 0 0 10px rgba(124, 58, 237, 0.15),
				0 24px 48px rgba(124, 58, 237, 0.3);
		}
		50% {
			box-shadow:
				0 0 0 18px rgba(124, 58, 237, 0.1),
				0 24px 56px rgba(124, 58, 237, 0.5);
		}
	}

	.leave-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		opacity: 0.6;
		padding: 4px;
		border-radius: 6px;
		text-decoration: none;
		transition: opacity 0.15s, color 0.15s;
	}
	.leave-btn:hover {
		opacity: 1;
		color: var(--danger);
	}

	/* ── Results Screen ─────────────────────────────── */
	.results-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		width: 100%;
		max-width: 480px;
		padding: 24px 0;
	}

	.results-title {
		font-size: 2rem;
		font-weight: 900;
		background: linear-gradient(135deg, #a855f7, #ec4899);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0;
	}

	.results-subtitle {
		font-size: 1rem;
		color: var(--text-muted);
		margin: 0 0 8px;
	}

	.podium {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 8px;
		width: 100%;
		margin: 16px 0;
	}

	.podium-place {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: 1;
		max-width: 140px;
	}

	.podium-medal {
		font-size: 2.5rem;
		line-height: 1;
	}

	.first .podium-medal {
		font-size: 3rem;
		filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.5));
	}

	.podium-name {
		font-weight: 700;
		font-size: 0.95rem;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.podium-score {
		font-size: 0.85rem;
		color: var(--success);
		font-weight: 600;
	}

	.podium-block {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 1.4rem;
		color: rgba(255, 255, 255, 0.5);
		border-radius: 8px 8px 0 0;
	}

	.first-block {
		height: 120px;
		background: linear-gradient(180deg, #a855f7, #7c3aed);
	}

	.second-block {
		height: 85px;
		background: linear-gradient(180deg, #64748b, #475569);
	}

	.third-block {
		height: 60px;
		background: linear-gradient(180deg, #78716c, #57534e);
	}

	.results-leaderboard {
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.results-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.results-row:last-child {
		border-bottom: none;
	}

	.results-rank {
		font-weight: 600;
		color: var(--text-muted);
		min-width: 2.5rem;
	}

	.results-name {
		flex: 1;
		font-weight: 600;
	}

	.results-score {
		font-weight: 700;
		color: var(--success);
	}
</style>
