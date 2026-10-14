export interface RankedScore {
	participantId: string;
	name: string;
	score: number;
	rank: number;
	tied: boolean;
}

export function rankScores<T extends { score: number }>(
	scores: readonly T[]
): Array<T & { rank: number; tied: boolean }> {
	const sorted = [...scores].sort((a, b) => b.score - a.score);
	let rank = 0;
	return sorted.map((entry, i) => {
		if (i === 0 || entry.score !== sorted[i - 1].score) rank = i + 1;
		return {
			...entry,
			rank,
			tied: sorted[i - 1]?.score === entry.score || sorted[i + 1]?.score === entry.score
		};
	});
}

export function formatRank(rank: number): string {
	const lastTwo = rank % 100;
	const suffixes = ['th', 'st', 'nd', 'rd'];
	const suffix = lastTwo >= 11 && lastTwo <= 13
		? 'th'
		: suffixes[rank % 10] ?? 'th';
	return `${rank}${suffix}`;
}
