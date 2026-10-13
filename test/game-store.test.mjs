import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compileModule } from 'svelte/compiler';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/stores/game.svelte.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
	compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
}).outputText;
const compiled = compileModule(js, { filename: 'game.svelte.js', generate: 'client' }).js.code;
const code = compiled.replace("'svelte/internal/client'", JSON.stringify(import.meta.resolve('svelte/internal/client')));
const { gameStore } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const initial = () => ({
	gameId: 'game', gameName: 'Trivia', joinCode: 'ABCDEF', status: 'active',
	buzzersExpireAt: 0, buzzRevision: 0,
	participants: Array.from({ length: 4 }, (_, i) => ({
		participantId: `p${i}`, name: `Player ${i}`, score: 0, buzzedIn: false, buzzOrder: 0
	}))
});
const snapshot = (revision, ids = [], deadline = 110_000) => ({
	buzzersExpireAt: deadline, buzzRevision: revision,
	buzzList: ids.map((participantId, i) => ({ participantId, buzzOrder: i + 1 }))
});

test('client locks at the deadline and restores a fresh window after reset', (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
	t.after(() => gameStore.set(null));
	gameStore.set({ ...initial(), status: 'waiting' });
	gameStore.handleMessage('game-started', ['game', snapshot(1, [], 0)]);
	assert.equal(gameStore.buzzersDisabled, true);
	gameStore.handleMessage('buzzers-reset', ['game', snapshot(2)]);
	assert.equal(gameStore.buzzersDisabled, false);
	t.mock.timers.tick(9_999);
	assert.equal(gameStore.buzzersDisabled, false);
	t.mock.timers.tick(1);
	assert.equal(gameStore.buzzersDisabled, true);
	gameStore.handleMessage('buzzers-reset', ['game', snapshot(3, [], 120_000)]);
	assert.equal(gameStore.buzzersDisabled, false);
});

test('three buzzes lock the client; retracting only reopens it before expiry', (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
	t.after(() => gameStore.set(null));
	gameStore.set(initial());
	gameStore.handleMessage('buzzed-in', ['game', snapshot(1, ['p0', 'p1', 'p2'])]);
	assert.equal(gameStore.buzzersDisabled, true);
	gameStore.handleMessage('unbuzzed', ['game', snapshot(2, ['p1', 'p2'])]);
	assert.equal(gameStore.buzzersDisabled, false);
	assert.equal(gameStore.buzzOrder[0].buzzOrder, 1);
	t.mock.timers.tick(10_000);
	gameStore.handleMessage('unbuzzed', ['game', snapshot(3, ['p2'])]);
	assert.equal(gameStore.buzzersDisabled, true);
});

test('reload uses the original deadline and stale or other-game messages cannot unlock it', (t) => {
	t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 105_000 });
	t.after(() => gameStore.set(null));
	gameStore.set({ ...initial(), buzzersExpireAt: 110_000, buzzRevision: 5 });
	assert.equal(gameStore.buzzersDisabled, false);
	gameStore.handleMessage('buzzers-reset', ['game', snapshot(4, [], 120_000)]);
	gameStore.handleMessage('buzzers-reset', ['another-game', snapshot(6, [], 120_000)]);
	assert.equal(gameStore.current.buzzersExpireAt, 110_000);
	t.mock.timers.tick(5_000);
	assert.equal(gameStore.buzzersDisabled, true);
	gameStore.set({ ...initial(), buzzersExpireAt: 109_999, buzzRevision: 5 });
	assert.equal(gameStore.buzzersDisabled, true);
});
