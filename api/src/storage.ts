import { TableClient, odata } from '@azure/data-tables';
import type { TableEntityResult } from '@azure/data-tables';

const CONN = () => process.env.AZURE_STORAGE_CONNECTION_STRING!;

export interface BuzzEntry {
	participantId: string;
	name: string;
	buzzOrder: number;
	buzzedAt: number;
}

export interface BuzzerState {
	buzzersExpireAt: number;
	buzzRound: number;
	buzzRevision: number;
	buzzList: BuzzEntry[];
}

export interface GameEntity extends BuzzerState {
	gameId: string;
	gameName: string;
	joinCode: string;
	status: 'waiting' | 'active' | 'ended';
	moderatorId: string;
	createdAt: string;
}

export interface ParticipantEntity {
	participantId: string;
	gameId: string;
	name: string;
	score: number;
	buzzedIn: boolean;
	buzzOrder: number;
	buzzedAt: number; // epoch ms — used for deterministic ordering
}

// ── Games ────────────────────────────────────────────────────────────────

function gameClient() {
	return TableClient.fromConnectionString(CONN(), 'Games');
}

function lookupClient() {
	return TableClient.fromConnectionString(CONN(), 'GameLookup');
}

let tablesEnsured = false;

export async function ensureTables() {
	if (tablesEnsured) return;
	await Promise.all([
		gameClient().createTable().catch(() => {}),
		lookupClient().createTable().catch(() => {}),
		TableClient.fromConnectionString(CONN(), 'Participants').createTable().catch(() => {})
	]);
	tablesEnsured = true;
}

export async function createGame(game: Omit<GameEntity, keyof BuzzerState>) {
	await ensureTables();
	const client = gameClient();
	await client.createEntity({
		partitionKey: 'GAME',
		rowKey: game.gameId,
		...game,
		buzzersExpireAt: 0,
		buzzRound: 0,
		buzzRevision: 0,
		buzzList: '[]'
	});
	// Write join code lookup: PartitionKey=LOOKUP, RowKey=joinCode
	await lookupClient().upsertEntity({
		partitionKey: 'LOOKUP',
		rowKey: game.joinCode,
		gameId: game.gameId,
		gameName: game.gameName
	});
}

export async function getGame(gameId: string): Promise<GameEntity | null> {
	try {
		const entity = await gameClient().getEntity('GAME', gameId);
		return entityToGame(entity);
	} catch {
		return null;
	}
}

export async function updateGameStatus(gameId: string, status: GameEntity['status']) {
	await gameClient().updateEntity(
		{ partitionKey: 'GAME', rowKey: gameId, status },
		'Merge'
	);
}

export async function findGameByJoinCode(joinCode: string): Promise<GameEntity | null> {
	try {
		const lookup = await lookupClient().getEntity('LOOKUP', joinCode);
		return getGame(lookup.gameId as string);
	} catch {
		return null;
	}
}

export async function joinCodeExists(joinCode: string): Promise<boolean> {
	try {
		await lookupClient().getEntity('LOOKUP', joinCode);
		return true;
	} catch {
		return false;
	}
}

// ── Participants ─────────────────────────────────────────────────────────

function participantClient() {
	return TableClient.fromConnectionString(CONN(), 'Participants');
}

export async function createParticipant(p: ParticipantEntity) {
	await participantClient().createEntity({
		partitionKey: p.gameId,
		rowKey: p.participantId,
		...p
	});
}

export async function getParticipants(
	gameId: string,
	game?: GameEntity | null
): Promise<ParticipantEntity[]> {
	const state = game === undefined ? await getGame(gameId) : game;
	const results: ParticipantEntity[] = [];
	const client = participantClient();
	for await (const entity of client.listEntities({
		queryOptions: { filter: odata`PartitionKey eq ${gameId}` }
	})) {
		results.push(applyBuzzerState(entityToParticipant(entity), state));
	}
	return results;
}

export async function getParticipant(
	gameId: string,
	participantId: string
): Promise<ParticipantEntity | null> {
	try {
		const entity = await participantClient().getEntity(gameId, participantId);
		return applyBuzzerState(entityToParticipant(entity), await getGame(gameId));
	} catch {
		return null;
	}
}

export async function updateParticipant(
	gameId: string,
	participantId: string,
	changes: Partial<Omit<ParticipantEntity, 'gameId' | 'participantId'>>
) {
	await participantClient().updateEntity(
		{ partitionKey: gameId, rowKey: participantId, ...changes },
		'Merge'
	);
}

export const BUZZ_LIMIT = 3;
export const BUZZ_WINDOW_MS = 10_000;

type BuzzerResult = { state: BuzzerState; error?: never } | { error: string; state?: never };

// Keep the deadline and all three slots on one entity so concurrent requests
// cannot exceed the limit or restore buzzes cleared by a reset.
async function changeBuzzers(
	gameId: string,
	change: (game: GameEntity) => BuzzerState | string
): Promise<BuzzerResult> {
	const client = gameClient();
	for (let attempt = 0; attempt < 10; attempt++) {
		const entity = await client.getEntity('GAME', gameId);
		const next = change(entityToGame(entity));
		if (typeof next === 'string') return { error: next };
		try {
			await client.updateEntity(
				{
					partitionKey: 'GAME',
					rowKey: gameId,
					buzzersExpireAt: next.buzzersExpireAt,
					buzzRound: next.buzzRound,
					buzzRevision: next.buzzRevision,
					buzzList: JSON.stringify(next.buzzList)
				},
				'Merge',
				{ etag: entity.etag }
			);
			return { state: next };
		} catch (error) {
			if (
				typeof error !== 'object' || error === null ||
				!('statusCode' in error) || error.statusCode !== 412
			) throw error;
		}
	}
	throw new Error('Could not update buzzers after repeated concurrent changes');
}

export async function resetAllBuzzers(gameId: string, buzzersExpireAt = 0): Promise<BuzzerState> {
	const result = await changeBuzzers(gameId, (game) => ({
		buzzersExpireAt,
		buzzRound: game.buzzRound + 1,
		buzzRevision: game.buzzRevision + 1,
		buzzList: []
	}));
	if (result.error !== undefined) throw new Error(result.error);
	return result.state;
}

export async function recordBuzz(
	gameId: string,
	participantId: string,
	name: string,
	expectedRound: number
): Promise<BuzzerResult> {
	return changeBuzzers(gameId, (game) => {
		if (game.status !== 'active') return 'Game is not active';
		if (game.buzzRound !== expectedRound) return 'Buzzers were reset; please buzz again';
		if (!game.buzzersExpireAt) return 'Waiting for moderator to reset buzzers';
		if (Date.now() >= game.buzzersExpireAt) return 'Buzz window has expired';
		if (game.buzzList.some((p) => p.participantId === participantId)) return 'Already buzzed in';
		if (game.buzzList.length >= BUZZ_LIMIT) return 'Buzz limit reached';
		return {
			buzzersExpireAt: game.buzzersExpireAt,
			buzzRound: game.buzzRound,
			buzzRevision: game.buzzRevision + 1,
			buzzList: [
				...game.buzzList,
				{ participantId, name, buzzOrder: game.buzzList.length + 1, buzzedAt: Date.now() }
			]
		};
	});
}

export async function recordUnbuzz(
	gameId: string,
	participantId: string,
	expectedRound: number
): Promise<BuzzerResult> {
	return changeBuzzers(gameId, (game) => {
		if (game.status !== 'active') return 'Game is not active';
		if (game.buzzRound !== expectedRound) return 'Buzzers were reset';
		if (!game.buzzList.some((p) => p.participantId === participantId)) return 'Not buzzed in';
		return {
			buzzersExpireAt: game.buzzersExpireAt,
			buzzRound: game.buzzRound,
			buzzRevision: game.buzzRevision + 1,
			buzzList: game.buzzList
				.filter((p) => p.participantId !== participantId)
				.map((p, i) => ({ ...p, buzzOrder: i + 1 }))
		};
	});
}

export async function deleteGameData(gameId: string, joinCode: string): Promise<void> {
	const participants = await getParticipants(gameId);
	await Promise.all([
		gameClient().deleteEntity('GAME', gameId).catch(() => {}),
		lookupClient().deleteEntity('LOOKUP', joinCode).catch(() => {}),
		...participants.map((p) =>
			participantClient().deleteEntity(gameId, p.participantId).catch(() => {})
		)
	]);
}

export async function getAllGames(): Promise<GameEntity[]> {
	const results: GameEntity[] = [];
	for await (const entity of gameClient().listEntities({
		queryOptions: { filter: `PartitionKey eq 'GAME'` }
	})) {
		results.push(entityToGame(entity));
	}
	return results;
}

// ── Entity mappers ───────────────────────────────────────────────────────

type AzureEntity = TableEntityResult<Record<string, unknown>>;

function entityToGame(e: AzureEntity): GameEntity {
	return {
		gameId: e.rowKey as string,
		gameName: e.gameName as string,
		joinCode: e.joinCode as string,
		status: e.status as GameEntity['status'],
		moderatorId: e.moderatorId as string,
		createdAt: e.createdAt as string,
		buzzersExpireAt: Number(e.buzzersExpireAt ?? 0),
		buzzRound: Number(e.buzzRound ?? 0),
		buzzRevision: Number(e.buzzRevision ?? 0),
		buzzList: JSON.parse(String(e.buzzList ?? '[]')) as BuzzEntry[]
	};
}

function applyBuzzerState(p: ParticipantEntity, game: GameEntity | null): ParticipantEntity {
	const buzz = game?.buzzList.find((b) => b.participantId === p.participantId);
	return { ...p, buzzedIn: !!buzz, buzzOrder: buzz?.buzzOrder ?? 0, buzzedAt: buzz?.buzzedAt ?? 0 };
}

function entityToParticipant(e: AzureEntity): ParticipantEntity {
	return {
		participantId: e.rowKey as string,
		gameId: e.partitionKey as string,
		name: e.name as string,
		score: Number(e.score ?? 0),
		buzzedIn: Boolean(e.buzzedIn),
		buzzOrder: Number(e.buzzOrder ?? 0),
		buzzedAt: Number(e.buzzedAt ?? 0)
	};
}
