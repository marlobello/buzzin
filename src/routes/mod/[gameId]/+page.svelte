<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { gameStore, buzzOrder } from '$lib/stores/game';
	import { connectToGame, disconnect } from '$lib/signalr';

	const gameId = $derived($page.params.gameId);
	let moderatorId = $state('');
	let loading = $state(true);
	let error = $state('');
	let copied = $state(false);
	let actionLoading = $state<string | null>(null);

	onMount(async () => {
		moderatorId = localStorage.getItem(`mod-${gameId}`) ?? '';
		if (!moderatorId) {
			await goto('/');
			return;
		}

		try {
			const res = await fetch(`/api/games/${gameId}`);
			if (!res.ok) throw new Error('Game not found');
			const data = await res.json();
			gameStore.set(data);

			await connectToGame(gameId, moderatorId, (target, args) => {
				gameStore.handleMessage(target, args);
			});
		} catch {
			error = 'Could not load game. It may have expired.';
		} finally {
			loading = false;
		}
	});

	onDestroy(() => {
		disconnect();
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
		} catch {
			error = 'Failed to reset buzzers.';
		} finally {
			actionLoading = null;
		}
	}

	async function awardPoint(participantId: string) {
		actionLoading = `point-${participantId}`;
		try {
			await post(`/api/games/${gameId}/point`, { participantId });
		} catch {
			error = 'Failed to award point.';
		} finally {
			actionLoading = null;
		}
	}

	function copyJoinCode() {
		if ($gameStore) navigator.clipboard.writeText($gameStore.joinCode).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const sortedByScore = $derived(
		$gameStore
			? [...$gameStore.participants].sort((a, b) => b.score - a.score)
			: []
	);
</script>

<svelte:head>
	<title>Moderator – {$gameStore?.gameName ?? 'buzzin'}</title>
</svelte:head>

<main class="page" style="padding-top: max(env(safe-area-inset-top), 16px);">
	{#if loading}
		<div style="flex:1; display:flex; align-items:center; justify-content:center;">
			<p class="text-muted">Loading…</p>
		</div>

	{:else if error && !$gameStore}
		<div class="card animate-in" style="margin-top: 40px;">
			<p style="color: var(--danger); text-align:center;">{error}</p>
			<a href="/" class="btn btn-secondary" style="margin-top:12px; text-decoration:none;">← Home</a>
		</div>

	{:else if $gameStore}
		{@const game = $gameStore}
		{@const buzzes = $buzzOrder}

		<div style="width:100%; max-width:520px; display:flex; flex-direction:column; gap:16px;">

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
				<a href="/" class="btn btn-secondary btn-sm" style="width:auto; padding: 8px 12px; text-decoration:none;">Exit</a>
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
						<span class="badge badge-accent">{buzzes.length} buzzed</span>
					</div>
					<div class="stack">
						{#each buzzes as participant, i (participant.participantId)}
							<div class="score-item {i === 0 ? 'first-buzz' : 'buzzed'} animate-in">
								<span class="buzz-badge">{i === 0 ? '⚡' : `#${i + 1}`}</span>
								<span class="score-name">{participant.name}</span>
								<span class="score-pts">{participant.score} pts</span>
								<button
									class="btn btn-success btn-sm"
									style="width:auto; padding: 6px 12px; font-size:0.8rem;"
									onclick={() => awardPoint(participant.participantId)}
									disabled={actionLoading === `point-${participant.participantId}`}
								>
									{actionLoading === `point-${participant.participantId}` ? '…' : '✓ Point'}
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
						{#each sortedByScore as p (p.participantId)}
							<div class="score-item animate-in">
								<span class="score-name">{p.name}</span>
								<span style="font-weight:700; color: {p.score > 0 ? 'var(--success)' : 'var(--text-muted)'}">
									{p.score} {p.score === 1 ? 'pt' : 'pts'}
								</span>
								{#if !p.buzzedIn && game.status === 'active'}
									<button
										class="btn btn-success btn-sm"
										style="width:auto; padding: 6px 12px; font-size:0.8rem;"
										onclick={() => awardPoint(p.participantId)}
										disabled={actionLoading === `point-${p.participantId}`}
									>
										{actionLoading === `point-${p.participantId}` ? '…' : '✓'}
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

		</div>
	{/if}
</main>
