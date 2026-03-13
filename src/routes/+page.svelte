<script lang="ts">
	import { goto } from '$app/navigation';

	let mode: 'home' | 'create' | 'join' = $state('home');
	let gameName = $state('');
	let playerName = $state('');
	let joinCode = $state('');
	let loading = $state(false);
	let error = $state('');

	async function createGame() {		if (!gameName.trim()) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/games', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gameName: gameName.trim() })
			});
			if (!res.ok) throw new Error('Failed to create game');
			const data = await res.json();
			localStorage.setItem(`mod-${data.gameId}`, data.moderatorId);
			await goto(`/mod/${data.gameId}`);
		} catch (e) {
			error = 'Could not create game. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function joinGame() {
		if (!playerName.trim() || joinCode.length < 6) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/games/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: playerName.trim(),
					joinCode: joinCode.toUpperCase().trim()
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to join game');
			localStorage.setItem(`participant-${data.gameId}`, data.participantId);
			await goto(`/play/${data.gameId}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not join game. Check the game name and code.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>buzzin</title>
</svelte:head>

<main class="page">
	<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; max-width: 480px; gap: 32px;">

		<div class="center animate-in">
			<div class="logo">buzzin</div>
			<p class="text-muted" style="margin-top: 6px;">Trivia buzz-in for everyone</p>
		</div>

		{#if mode === 'home'}
			<div class="stack animate-in" style="width: 100%;">
				<button class="btn btn-primary" onclick={() => mode = 'create'}>
					🎮 Create a Game
				</button>
				<button class="btn btn-secondary" onclick={() => mode = 'join'}>
					🎯 Join a Game
				</button>
			</div>

		{:else if mode === 'create'}
			<div class="card animate-in">
				<div class="stack">
					<div>
						<h1 style="font-size: 1.3rem; margin-bottom: 4px;">Create Game</h1>
						<p class="text-muted text-sm">You'll be the moderator</p>
					</div>

					<div class="field">
						<label for="game-name">Game Name</label>
						<input
							id="game-name"
							class="input"
							type="text"
							placeholder="Friday Night Trivia"
							bind:value={gameName}
							maxlength={40}
							onkeydown={(e) => e.key === 'Enter' && createGame()}
						/>
					</div>

					{#if error}
						<p class="text-sm" style="color: var(--danger);">{error}</p>
					{/if}

					<button
						class="btn btn-primary"
						onclick={createGame}
						disabled={loading || !gameName.trim()}
					>
						{loading ? 'Creating…' : 'Create Game →'}
					</button>

					<button class="btn btn-secondary btn-sm" onclick={() => { mode = 'home'; error = ''; }}>
						← Back
					</button>
				</div>
			</div>

		{:else if mode === 'join'}
			<div class="card animate-in">
				<div class="stack">
					<div>
						<h1 style="font-size: 1.3rem; margin-bottom: 4px;">Join Game</h1>
						<p class="text-muted text-sm">Enter the details shared by your moderator</p>
					</div>

					<div class="field">
						<label for="player-name">Your Name</label>
						<input
							id="player-name"
							class="input"
							type="text"
							placeholder="Alex"
							bind:value={playerName}
							maxlength={30}
							autocomplete="nickname"
						/>
					</div>

					<div class="field">
						<label for="join-code">Join Code</label>
						<input
							id="join-code"
							class="input uppercase"
							type="text"
							placeholder="ABCDEF"
							bind:value={joinCode}
							maxlength={6}
							inputmode="text"
							autocomplete="off"
							autocorrect="off"
							spellcheck={false}
						/>
					</div>

					{#if error}
						<p class="text-sm" style="color: var(--danger);">{error}</p>
					{/if}

					<button
						class="btn btn-primary"
						onclick={joinGame}
						disabled={loading || !playerName.trim() || joinCode.length < 6}
					>
						{loading ? 'Joining…' : 'Join Game →'}
					</button>

					<button class="btn btn-secondary btn-sm" onclick={() => { mode = 'home'; error = ''; }}>
						← Back
					</button>
				</div>
			</div>
		{/if}

	</div>
</main>
