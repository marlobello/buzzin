import { TableClient, odata } from '@azure/data-tables';
import type { TableEntityResult } from '@azure/data-tables';

const CONN = () => process.env.AZURE_STORAGE_CONNECTION_STRING!;

export interface GameEntity {
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

export async function createGame(game: GameEntity) {
	await ensureTables();
	const client = gameClient();
	await client.createEntity({
		partitionKey: 'GAME',
		rowKey: game.gameId,
		...game
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

export async function getParticipants(gameId: string): Promise<ParticipantEntity[]> {
	const results: ParticipantEntity[] = [];
	const client = participantClient();
	for await (const entity of client.listEntities({
		queryOptions: { filter: odata`PartitionKey eq ${gameId}` }
	})) {
		results.push(entityToParticipant(entity));
	}
	return results;
}

export async function getParticipant(
	gameId: string,
	participantId: string
): Promise<ParticipantEntity | null> {
	try {
		const entity = await participantClient().getEntity(gameId, participantId);
		return entityToParticipant(entity);
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

export async function resetAllBuzzers(gameId: string) {
	const participants = await getParticipants(gameId);
	await Promise.all(
		participants.map((p) =>
			participantClient().updateEntity(
				{ partitionKey: gameId, rowKey: p.participantId, buzzedIn: false, buzzOrder: 0 },
				'Merge'
			)
		)
	);
}

export async function nextBuzzOrder(gameId: string): Promise<number> {
	const participants = await getParticipants(gameId);
	const max = participants.reduce((m, p) => Math.max(m, p.buzzOrder), 0);
	return max + 1;
}

/** Records a buzz using a millisecond timestamp and assigns buzz order by
 *  re-ranking all buzzed-in participants by their buzzedAt time.
 *  Returns the assigned buzzOrder (1 = first). */
export async function recordBuzz(gameId: string, participantId: string): Promise<number> {
	const buzzedAt = Date.now();
	await updateParticipant(gameId, participantId, { buzzedIn: true, buzzedAt });

	// Re-read all buzzed participants and assign deterministic order by time
	const participants = await getParticipants(gameId);
	const buzzed = participants
		.filter((p) => p.buzzedIn)
		.sort((a, b) => a.buzzedAt - b.buzzedAt);

	const myRank = buzzed.findIndex((p) => p.participantId === participantId) + 1;

	// Update buzzOrder for all buzzed players (handles any reordering edge cases)
	await Promise.all(
		buzzed.map((p, i) =>
			updateParticipant(gameId, p.participantId, { buzzOrder: i + 1 })
		)
	);

	return myRank;
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
		createdAt: e.createdAt as string
	};
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
