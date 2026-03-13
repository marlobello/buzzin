import { TableClient } from '@azure/data-tables';

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
}

// ── Games ────────────────────────────────────────────────────────────────

function gameClient() {
	return TableClient.fromConnectionString(CONN(), 'Games');
}

function lookupClient() {
	return TableClient.fromConnectionString(CONN(), 'GameLookup');
}

export async function ensureTables() {
	await Promise.all([
		gameClient().createTable().catch(() => {}),
		lookupClient().createTable().catch(() => {}),
		TableClient.fromConnectionString(CONN(), 'Participants').createTable().catch(() => {})
	]);
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
		queryOptions: { filter: `PartitionKey eq '${gameId}'` }
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

// ── Entity mappers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityToGame(e: any): GameEntity {
	return {
		gameId: e.rowKey,
		gameName: e.gameName,
		joinCode: e.joinCode,
		status: e.status,
		moderatorId: e.moderatorId,
		createdAt: e.createdAt
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityToParticipant(e: any): ParticipantEntity {
	return {
		participantId: e.rowKey,
		gameId: e.partitionKey,
		name: e.name,
		score: Number(e.score ?? 0),
		buzzedIn: Boolean(e.buzzedIn),
		buzzOrder: Number(e.buzzOrder ?? 0)
	};
}
