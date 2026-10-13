const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TableClient } = require('@azure/data-tables');
const { app } = require('@azure/functions');
const storage = require('../dist/src/storage');
const signalr = require('../dist/src/signalr');

test('buzzer rounds and HTTP endpoints', async (t) => {
	let now = 100_000;
	let version = 0;
	let game;
	let beforeUpdate;
	let broadcasts;
	const handlers = {};
	const participants = Array.from({ length: 8 }, (_, i) => ({
		partitionKey: 'game',
		rowKey: `p${i}`,
		name: `Player ${i}`,
		score: i,
		buzzedIn: false,
		buzzOrder: 0,
		buzzedAt: 0
	}));
	const client = {
		async getEntity(partitionKey, rowKey) {
			if (partitionKey === 'GAME') return { ...game, etag: String(version) };
			const participant = participants.find((p) => p.rowKey === rowKey);
			if (!participant) throw Object.assign(new Error('Not found'), { statusCode: 404 });
			return { ...participant };
		},
		async updateEntity(changes, _mode, options) {
			if (beforeUpdate) {
				const action = beforeUpdate;
				beforeUpdate = undefined;
				action();
			}
			if (options?.etag !== undefined && options.etag !== String(version)) {
				throw Object.assign(new Error('Conflict'), { statusCode: 412 });
			}
			game = { ...game, ...changes };
			version++;
		},
		async *listEntities() {
			yield* participants;
		}
	};
	t.mock.method(Date, 'now', () => now);
	t.mock.method(TableClient, 'fromConnectionString', () => client);
	t.mock.method(app, 'http', (name, options) => { handlers[name] = options.handler; });
	t.mock.method(signalr, 'broadcastToGame', async (...args) => { broadcasts.push(args); });
	for (const name of ['gamesStart', 'gamesReset', 'gamesBuzz', 'gamesUnbuzz', 'gamesGet']) {
		require(`../dist/src/functions/${name}`);
	}
	t.beforeEach(() => {
		now = 100_000;
		version = 0;
		beforeUpdate = undefined;
		broadcasts = [];
		game = {
			partitionKey: 'GAME', rowKey: 'game', gameName: 'Trivia', joinCode: 'ABCDEF',
			moderatorId: 'mod', status: 'waiting', createdAt: '',
			buzzersExpireAt: 0, buzzRound: 0, buzzRevision: 0, buzzList: '[]'
		};
	});
	const call = (name, body = {}) => handlers[name]({
		params: { gameId: 'game' }, json: async () => body
	}, {});
	const open = async () => {
		await call('gamesStart', { moderatorId: 'mod' });
		return call('gamesReset', { moderatorId: 'mod' });
	};
	const buzz = (i) => call('gamesBuzz', { participantId: `p${i}` });

	await t.test('start stays disabled, reset opens exactly 10 seconds, reload keeps the deadline', async () => {
		await call('gamesStart', { moderatorId: 'mod' });
		assert.equal((await buzz(0)).status, 409);
		assert.equal((await call('gamesReset', { moderatorId: 'wrong' })).status, 403);
		const reset = await call('gamesReset', { moderatorId: 'mod' });
		assert.equal(reset.jsonBody.buzzersExpireAt, now + 10_000);
		assert.equal(broadcasts.at(-1)[2][0].buzzersExpireAt, now + 10_000);
		now += 9_999;
		assert.equal((await buzz(0)).jsonBody.buzzOrder, 1);
		const snapshot = (await call('gamesGet')).jsonBody;
		assert.equal(snapshot.buzzersExpireAt, 110_000);
		assert.equal(snapshot.participants[0].buzzedIn, true);
		assert.equal(snapshot.participants[0].score, 0);
		now++;
		assert.equal((await buzz(1)).status, 409);
		now += 5_000;
		await call('gamesReset', { moderatorId: 'mod' });
		assert.equal((await buzz(1)).jsonBody.buzzOrder, 1);
		assert.equal((await call('gamesGet')).jsonBody.participants[0].buzzedIn, false);
	});

	await t.test('simultaneous buzzes admit only three and duplicate buzzes consume one slot', async () => {
		await open();
		const results = await Promise.all(participants.map((_, i) => buzz(i)));
		assert.equal(results.filter((r) => r.jsonBody.ok).length, 3);
		assert.equal(JSON.parse(game.buzzList).length, 3);
		assert.deepEqual(JSON.parse(game.buzzList).map((p) => p.buzzOrder), [1, 2, 3]);
		await call('gamesReset', { moderatorId: 'mod' });
		const duplicate = await Promise.all([buzz(0), buzz(0)]);
		assert.equal(duplicate.filter((r) => r.jsonBody.ok).length, 1);
		assert.equal(JSON.parse(game.buzzList).length, 1);
	});

	await t.test('retraction frees a slot before expiry, but never reopens an expired window', async () => {
		await open();
		for (let i = 0; i < 3; i++) await buzz(i);
		assert.equal((await buzz(3)).status, 409);
		await call('gamesUnbuzz', { participantId: 'p0' });
		assert.deepEqual(JSON.parse(game.buzzList).map((p) => p.buzzOrder), [1, 2]);
		assert.equal((await buzz(3)).jsonBody.buzzOrder, 3);
		now += 10_000;
		await call('gamesUnbuzz', { participantId: 'p1' });
		assert.equal((await buzz(4)).status, 409);
	});

	await t.test('an in-flight buzz cannot restore a buzz cleared by reset', async () => {
		await open();
		beforeUpdate = () => {
			game = { ...game, buzzRound: game.buzzRound + 1, buzzRevision: game.buzzRevision + 1, buzzList: '[]' };
			version++;
		};
		assert.equal((await buzz(0)).status, 409);
		assert.deepEqual(JSON.parse(game.buzzList), []);
	});

	await t.test('non-concurrency storage errors propagate rather than becoming successful buzzes', async () => {
		await open();
		beforeUpdate = () => { throw Object.assign(new Error('Storage unavailable'), { statusCode: 503 }); };
		await assert.rejects(buzz(0), /Storage unavailable/);
		assert.deepEqual(JSON.parse(game.buzzList), []);
	});
});
