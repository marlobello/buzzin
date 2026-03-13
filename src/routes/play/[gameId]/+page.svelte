<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { gameStore } from '$lib/stores/game.svelte';
	import { connectToGame, disconnect } from '$lib/signalr';
	import { playCoinSound } from '$lib/sounds';
	import confetti from 'canvas-confetti';

	const gameId = $derived(page.params.gameId);
	let participantId = $state('');
	let loading = $state(true);
	let error = $state('');
	let buzzing = $state(false);
	let prevScore: number | null = null;
	let fireConfetti: confetti.CreateTypes | null = null;

	onMount(() => {
		fireConfetti = confetti.create(undefined, { useWorker: false, resize: true });
	});

	let myParticipant = $derived(
		gameStore.current?.participants.find((p) => p.participantId === participantId) ?? null
	);

	let canBuzz = $derived(
		gameStore.current?.status === 'active' && myParticipant != null && !myParticipant.buzzedIn
	);

	$effect(() => {
		const score = myParticipant?.score ?? 0;
		if (prevScore !== null && score > prevScore) {
			playCoinSound();
			fireConfetti?.({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
		}
		prevScore = score;
	});

	$effect(() => {
		if (gameStore.current?.status === 'ended') {
			goto('/');
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

			<!-- Status text: only shown when waiting or ready, not when buzzed -->
			{#if game.status === 'waiting' || !myParticipant?.buzzedIn}
				<p class="text-muted animate-in" style="font-size:1rem; text-align:center; min-height:1.5em;">
					{game.status === 'waiting' ? 'Waiting for moderator to start…' : 'Ready — hit the buzzer!'}
				</p>
			{:else}
				<p style="min-height:1.5em;"></p>
			{/if}

			<!-- THE BUZZER -->
			<button
				class="buzzer"
				class:buzzed={myParticipant?.buzzedIn && myParticipant.buzzOrder !== 1}
				class:buzzed-first={myParticipant?.buzzedIn && myParticipant.buzzOrder === 1}
				class:waiting={game.status === 'waiting'}
				onclick={buzz}
				disabled={!canBuzz || buzzing}
				aria-label="Buzz in"
			>
				<span class="buzzer-icon">
					{#if game.status === 'waiting'}
						⏳
					{:else if myParticipant?.buzzedIn}
						#{myParticipant.buzzOrder}
					{:else}
						🔔
					{/if}
				</span>
			</button>

		</div>

		<!-- Score strip -->
		{#if game.participants.length > 1}
			<div style="width:100%; max-width:480px; padding-bottom:8px;">
				<div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;">
					{#each [...game.participants].sort((a,b) => b.score - a.score) as p, i (p.participantId)}
						{@const medal = ['🥇','🥈','🥉'][i]}
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
</style>
