<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { gameStore } from '$lib/stores/game';
	import { connectToGame, disconnect } from '$lib/signalr';

	const gameId = $derived($page.params.gameId);
	let participantId = $state('');
	let loading = $state(true);
	let error = $state('');
	let buzzing = $state(false);

	let myParticipant = $derived(
		$gameStore?.participants.find((p) => p.participantId === participantId) ?? null
	);

	let canBuzz = $derived(
		$gameStore?.status === 'active' && myParticipant != null && !myParticipant.buzzedIn
	);

	$effect(() => {
		if ($gameStore?.status === 'ended') {
			goto('/');
		}
	});

	onMount(async () => {
		participantId = localStorage.getItem(`participant-${gameId}`) ?? '';
		if (!participantId) {
			await goto('/');
			return;
		}

		try {
			const res = await fetch(`/api/games/${gameId}`);
			if (!res.ok) throw new Error('Game not found');
			const data = await res.json();
			gameStore.set(data);
		} catch {
			error = 'Could not load game. It may have expired.';
			loading = false;
			return;
		}

		loading = false;

		connectToGame(gameId, participantId, (target, args) => {
			gameStore.handleMessage(target, args);
		}).catch((e) => {
			console.warn('SignalR connection failed:', e);
		});
	});

	onDestroy(() => {
		disconnect();
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
	<title>{$gameStore?.gameName ?? 'buzzin'}</title>
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

	{:else if $gameStore}
		{@const game = $gameStore}

		<!-- Top bar -->
		<div style="width:100%; max-width:480px; display:flex; align-items:center; justify-content:space-between; padding: 4px 0;">
			<div>
				<div style="font-weight:700; font-size:1.1rem;">{game.gameName}</div>
				<div class="text-muted text-sm">{myParticipant?.name ?? ''}</div>
			</div>
			<div style="text-align:right;">
				<div style="font-size:1.6rem; font-weight:800; color: var(--success);">
					{myParticipant?.score ?? 0}
				</div>
				<div class="text-muted text-sm">points</div>
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
					{#each [...game.participants].sort((a,b) => b.score - a.score) as p (p.participantId)}
						<div style="
							flex-shrink:0;
							background:var(--surface);
							border:1px solid {p.participantId === participantId ? 'var(--accent)' : 'var(--border)'};
							border-radius:var(--radius-sm);
							padding:8px 12px;
							text-align:center;
							min-width:80px;
						">
							<div style="font-size:0.7rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70px;">{p.name}</div>
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

	.buzzer:disabled:not(.buzzed) {
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
		font-size: min(20vw, 80px);
		pointer-events: none;
		user-select: none;
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
</style>
