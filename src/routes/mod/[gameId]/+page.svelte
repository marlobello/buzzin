<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { gameStore } from '$lib/stores/game.svelte';
	import { connectToGame, disconnect } from '$lib/signalr';
	import { playBuzzSound, playCoinSound, playRemoveSound } from '$lib/sounds';

	const gameId = $derived(page.params.gameId);
	let moderatorId = $state('');
	let loading = $state(true);
	let error = $state('');
	let copied = $state(false);
	let actionLoading = $state<string | null>(null);
	let awardedThisRound = $state(new Set<string>());

	let lastBuzzCount = 0;
	$effect(() => {
		const count = gameStore.buzzOrder.length;
		if (count === 1 && lastBuzzCount === 0) playBuzzSound();
		lastBuzzCount = count;
	});

	$effect(() => {
		const id = gameId;
		if (!id) return;
		let active = true;

		(async () => {
			moderatorId = localStorage.getItem(`mod-${id}`) ?? '';
			if (!moderatorId) {
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

			connectToGame(id, moderatorId, (target, args) => {
				gameStore.handleMessage(target, args);
			}).catch((e) => {
				console.warn('SignalR connection failed:', e);
				error = 'Live updates unavailable — refresh to see changes.';
			});
		})();

		return () => {
			active = false;
			disconnect();
		};
	});

	async function post(path: string, body?: Record<string, unknown>) {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify({ ...body, moderatorId }) : JSON.stringify({ moderatorId })
		});
		if (!res.ok) {
			const d = await res.json().catch(() => ({}));
			throw new Error(d.error ?? 'Request failed');
		}
		return res.json();
	}

	async function startGame() {
		actionLoading = 'start';
		try {
			await post(`/api/games/${gameId}/start`);
			awardedThisRound = new Set();
		} catch {
			error = 'Failed to start game.';
		} finally {
			actionLoading = null;
		}
	}

	async function resetBuzzers() {
		actionLoading = 'reset';
		try {
			await post(`/api/games/${gameId}/reset`);
			awardedThisRound = new Set();
		} catch {
			error = 'Failed to reset buzzers.';
		} finally {
			actionLoading = null;
		}
	}

	function isParticipantScoreBusy(participantId: string) {
		return (
			actionLoading === `point-${participantId}` ||
			actionLoading === `score-${participantId}`
		);
	}

	function removeAwardedThisRound(participantId: string) {
		if (!awardedThisRound.has(participantId)) return;
		awardedThisRound.delete(participantId);
		awardedThisRound = new Set(awardedThisRound);
	}

	async function changeScore(participantId: string, delta: -1 | 1, source: 'award' | 'scoreboard') {
		actionLoading = source === 'award' ? `point-${participantId}` : `score-${participantId}`;
		try {
			await post(`/api/games/${gameId}/point`, { participantId, delta });
			if (source === 'award') {
				if (delta < 0) {
					removeAwardedThisRound(participantId);
					playRemoveSound();
				} else {
					awardedThisRound = new Set([...awardedThisRound, participantId]);
					playCoinSound();
				}
				return;
			}

			if (delta < 0) {
				removeAwardedThisRound(participantId);
				playRemoveSound();
			} else {
				playCoinSound();
			}
		} catch {
			error = 'Failed to update point.';
		} finally {
			actionLoading = null;
		}
	}

	async function awardPoint(participantId: string) {
		const removing = awardedThisRound.has(participantId);
		await changeScore(participantId, removing ? -1 : 1, 'award');
	}

	async function exitGame() {
		actionLoading = 'ending';
		try {
			await post(`/api/games/${gameId}/end`);
		} catch {
			// Best-effort
		} finally {
			actionLoading = null;
		}
	}

	async function deleteAndLeave() {
		try {
			await fetch(`/api/games/${gameId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ moderatorId })
			});
		} catch {
			// Best-effort
		}
		await goto('/');
	}

	function copyJoinCode() {
		if (gameStore.current) navigator.clipboard.writeText(gameStore.current.joinCode).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const sortedByScore = $derived(
		gameStore.current
			? [...gameStore.current.participants].sort((a, b) => b.score - a.score)
			: []
	);

	let finalScores = $derived(
		gameStore.current?.finalScores ??
			(gameStore.current
				? [...gameStore.current.participants]
						.map((p) => ({ participantId: p.participantId, name: p.name, score: p.score }))
						.sort((a, b) => b.score - a.score)
				: [])
	);

	const medals = ['🥇', '🥈', '🥉'];

	function rankLabel(i: number): string {
		return medals[i] ?? `${i + 1}th`;
	}
</script>

<svelte:head>
	<title>Moderator – {gameStore.current?.gameName ?? 'buzzin'}</title>
</svelte:head>

<main class="page" style="padding-top: max(env(safe-area-inset-top), 16px);">
	{#if loading}
		<div style="flex:1; display:flex; align-items:center; justify-content:center;">
			<p class="text-muted">Loading…</p>
		</div>

	{:else if error && !gameStore.current}
		<div class="card animate-in" style="margin-top: 40px;">
			<p style="color: var(--danger); text-align:center;">{error}</p>
			<a href="/" class="btn btn-secondary" style="margin-top:12px; text-decoration:none;">← Home</a>
		</div>

	{:else if gameStore.current}
		{@const game = gameStore.current}
		{@const buzzes = gameStore.buzzOrder}

		{#if game.status === 'ended'}
			<!-- Final Results Screen -->
			<div style="width:100%; max-width:480px; display:flex; flex-direction:column; align-items:center; gap:16px; padding:24px 0;">
				<h1 class="results-title">🎉 Game Over!</h1>
				<p class="text-muted" style="margin:0;">{game.gameName}</p>

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
					<div class="results-leaderboard" style="width:100%;">
						{#each finalScores.slice(3) as p, i (p.participantId)}
							<div class="results-row">
								<span class="results-rank">{i + 4}th</span>
								<span class="results-name">{p.name}</span>
								<span class="results-score">{p.score} pts</span>
							</div>
						{/each}
					</div>
				{/if}

				<button class="btn btn-secondary" style="max-width:300px; width:100%;" onclick={deleteAndLeave}>
					🗑️ Delete Game & Exit
				</button>
			</div>
		{:else}

		<div style="width:100%; max-width:480px; display:flex; flex-direction:column; gap:16px;">

			<!-- Header -->
			<div class="animate-in" style="display:flex; align-items:center; gap:12px; padding: 4px 0;">
				<div style="flex:1;">
					<div class="logo" style="font-size:1.6rem;">{game.gameName}</div>
					<div class="row" style="margin-top:4px;">
						<span class="badge {game.status === 'active' ? 'badge-success' : 'badge-accent'}">
							{game.status === 'waiting' ? '⏳ Waiting' : '🟢 Live'}
						</span>
						<span class="text-muted text-sm">{game.participants.length} players</span>
					</div>
				</div>
				<button
					class="btn btn-secondary btn-sm"
					style="width:auto; padding: 8px 12px;"
					onclick={exitGame}
					disabled={actionLoading === 'ending'}
				>
					{actionLoading === 'ending' ? 'Ending…' : 'End Game'}
				</button>
			</div>

			<!-- Join code -->
			<div class="card animate-in" style="padding: 16px;">
				<div style="display:flex; align-items:center; justify-content:space-between;">
					<div>
						<div class="text-muted text-sm" style="margin-bottom:2px;">Join Code</div>
						<div style="font-size:2rem; font-weight:800; letter-spacing:0.2em; color:#a855f7;">{game.joinCode}</div>
						<div class="text-muted text-sm">Game: <strong style="color:var(--text);">{game.gameName}</strong></div>
					</div>
					<button class="btn btn-secondary btn-sm" style="width:auto;" onclick={copyJoinCode}>
						{copied ? '✓ Copied' : '📋 Copy'}
					</button>
				</div>
			</div>

			{#if error}
				<p class="text-sm" style="color:var(--danger); padding: 0 4px;">{error}</p>
			{/if}

			<!-- Controls -->
			<div class="row animate-in">
				{#if game.status === 'waiting'}
					<button
						class="btn btn-primary"
						onclick={startGame}
						disabled={actionLoading === 'start' || game.participants.length === 0}
					>
						{actionLoading === 'start' ? 'Starting…' : '▶ Start Game'}
					</button>
				{:else}
					<button
						class="btn btn-secondary"
						onclick={resetBuzzers}
						disabled={actionLoading === 'reset'}
					>
						{actionLoading === 'reset' ? 'Resetting…' : '🔄 Reset Buzzers'}
					</button>
				{/if}
			</div>

			<!-- Buzz order — only shown when someone has buzzed -->
			{#if buzzes.length > 0}
				<div class="card animate-in">
					<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
						<h2>Buzz Order</h2>
						<span class="badge {gameStore.buzzLimitReached ? 'badge-warning' : 'badge-accent'}">
							{buzzes.length}/3 buzzed
						</span>
					</div>
					<div class="stack">
						{#each buzzes as participant, i (participant.participantId)}
							<div class="score-item {i === 0 ? 'first-buzz' : 'buzzed'} animate-in">
								<span class="buzz-badge">{i === 0 ? '⚡' : `#${i + 1}`}</span>
								<span class="score-name">{participant.name}</span>
								<span class="score-pts">{participant.score} pts</span>
								<button
									class="btn {awardedThisRound.has(participant.participantId) ? 'btn-danger' : 'btn-success'} btn-sm"
									style="width:auto; padding: 6px 12px; font-size:0.8rem;"
									onclick={() => awardPoint(participant.participantId)}
									disabled={isParticipantScoreBusy(participant.participantId)}
								>
									{actionLoading === `point-${participant.participantId}` ? '…' : awardedThisRound.has(participant.participantId) ? '✕ Remove' : '✓ Point'}
								</button>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- All participants & scores -->
			<div class="card animate-in">
				<h2 style="margin-bottom:12px;">Scoreboard</h2>
				{#if game.participants.length === 0}
					<p class="text-muted text-sm center" style="padding: 12px 0;">
						No players yet — share the join code!
					</p>
				{:else}
					<div class="stack">
						{#each sortedByScore as p, i (p.participantId)}
							<div class="score-item animate-in">
								<span style="font-size:1.1rem; min-width:2rem;">{rankLabel(i)}</span>
								<span class="score-name">{p.name}</span>
								<div style="display:flex; align-items:center; gap:8px;">
									<button
										class="btn btn-secondary btn-sm"
										style="width:auto; min-width:2rem; padding:4px 8px; font-size:0.85rem; line-height:1;"
										onclick={() => changeScore(p.participantId, -1, 'scoreboard')}
										disabled={isParticipantScoreBusy(p.participantId)}
										aria-label={`Decrease ${p.name}'s score`}
									>
										−
									</button>
									<span style="font-weight:700; min-width:4.5rem; text-align:center; color: {p.score > 0 ? 'var(--success)' : 'var(--text-muted)'}">
										{p.score} {p.score === 1 ? 'pt' : 'pts'}
									</span>
									<button
										class="btn btn-secondary btn-sm"
										style="width:auto; min-width:2rem; padding:4px 8px; font-size:0.85rem; line-height:1;"
										onclick={() => changeScore(p.participantId, 1, 'scoreboard')}
										disabled={isParticipantScoreBusy(p.participantId)}
										aria-label={`Increase ${p.name}'s score`}
									>
										+
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

		</div>
		{/if}
	{/if}
</main>

<style>
	.results-title {
		font-size: 2rem;
		font-weight: 900;
		background: linear-gradient(135deg, #a855f7, #ec4899);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0;
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

	.badge-warning {
		background: rgba(234, 179, 8, 0.15);
		color: #eab308;
	}
</style>
