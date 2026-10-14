import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/rankings.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
}).outputText;
const { rankScores, formatRank } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('tied scores share the higher place and skip the occupied ranks', () => {
	for (const [scores, ranks, tied] of [
		[[10, 10, 7, 4], [1, 1, 3, 4], [true, true, false, false]],
		[[10, 7, 7, 4], [1, 2, 2, 4], [false, true, true, false]],
		[[10, 7, 4, 4, 2], [1, 2, 3, 3, 5], [false, false, true, true, false]],
		[[10, 10, 10, 10, 7, 7], [1, 1, 1, 1, 5, 5], [true, true, true, true, true, true]],
		[[0, 0, 0], [1, 1, 1], [true, true, true]],
		[[2, -1, -1, -3], [1, 2, 2, 4], [false, true, true, false]]
	]) {
		const result = rankScores(scores.map((score, i) => ({ participantId: `p${i}`, score })));
		assert.deepEqual(result.map((p) => p.rank), ranks);
		assert.deepEqual(result.map((p) => p.tied), tied);
	}
});

test('ranking sorts a copy, preserves tied players, and handles empty and single-player games', () => {
	const scores = [
		{ participantId: 'low', name: 'Low', score: 2 },
		{ participantId: 'first', name: 'First', score: 8 },
		{ participantId: 'also-first', name: 'Also first', score: 8 }
	];
	const original = structuredClone(scores);
	const ranked = rankScores(scores);
	assert.deepEqual(ranked.map((p) => p.participantId), ['first', 'also-first', 'low']);
	assert.deepEqual(ranked.map((p) => p.rank), [1, 1, 3]);
	assert.deepEqual(scores, original);
	assert.deepEqual(rankScores([]), []);
	assert.deepEqual(rankScores([scores[0]]), [{ ...scores[0], rank: 1, tied: false }]);
});

test('rank labels remain correct when ties skip into later places', () => {
	assert.deepEqual(
		[1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(formatRank),
		['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']
	);
});
