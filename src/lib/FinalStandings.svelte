<script lang="ts">
	import { formatRank, type RankedScore } from '$lib/rankings';

	let { scores }: { scores: RankedScore[] } = $props();
	const podium = $derived(
		scores.filter((p) => p.rank <= 3).sort((a, b) => {
			const position = (rank: number) => rank === 2 ? 0 : rank === 1 ? 1 : 2;
			return position(a.rank) - position(b.rank);
		})
	);
	const remaining = $derived(scores.filter((p) => p.rank > 3));
	const medals = ['🥇', '🥈', '🥉'];
</script>

{#if podium.length > 0}
	<div class="podium">
		{#each podium as p (p.participantId)}
			<div
				class="podium-place animate-in"
				class:first={p.rank === 1}
				class:second={p.rank === 2}
				class:third={p.rank === 3}
				role="group"
				aria-label={`${p.name}, ${p.tied ? 'tied for ' : ''}${formatRank(p.rank)}, ${p.score} points`}
			>
				<div class="podium-medal" aria-hidden="true">{medals[p.rank - 1]}</div>
				<div class="podium-name" title={p.name}>{p.name}</div>
				<div class="podium-score">{p.score} pts</div>
				<div class="podium-block">
					{#if p.tied}<span class="podium-tie">Tied</span>{/if}
					<span>{formatRank(p.rank)}</span>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if remaining.length > 0}
	<div class="results-leaderboard">
		{#each remaining as p (p.participantId)}
			<div class="results-row">
				<span class="results-rank">{p.tied ? 'Tied ' : ''}{formatRank(p.rank)}</span>
				<span class="results-name">{p.name}</span>
				<span class="results-score">{p.score} pts</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.podium {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: center;
		gap: 16px 8px;
		width: 100%;
		margin: 16px 0;
	}

	.podium-place {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: 1 1 85px;
		min-width: 0;
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
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 1.4rem;
		color: rgba(255, 255, 255, 0.5);
		border-radius: 8px 8px 0 0;
	}

	.podium-tie {
		font-size: 0.8rem;
		font-weight: 600;
	}

	.first .podium-block {
		height: 120px;
		background: linear-gradient(180deg, #a855f7, #7c3aed);
	}

	.second .podium-block {
		height: 85px;
		background: linear-gradient(180deg, #64748b, #475569);
	}

	.third .podium-block {
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
		min-width: 0;
		overflow-wrap: anywhere;
		font-weight: 600;
	}

	.results-score {
		font-weight: 700;
		color: var(--success);
		white-space: nowrap;
	}
</style>
