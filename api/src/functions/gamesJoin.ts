import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomBytes } from 'crypto';
import { findGameByJoinCode, createParticipant, getParticipants } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesJoin', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/join',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const body = (await request.json().catch(() => null)) as {
			name?: string;
			joinCode?: string;
		} | null;

		if (!body?.name?.trim() || !body?.joinCode?.trim()) {
			return { status: 400, jsonBody: { error: 'name and joinCode are required' } };
		}

		const game = await findGameByJoinCode(body.joinCode.toUpperCase().trim());

		if (!game) {
			return {
				status: 404,
				jsonBody: { error: 'Game not found. Check the join code and try again.' }
			};
		}

		if (game.status === 'ended') {
			return { status: 410, jsonBody: { error: 'This game has ended.' } };
		}

		// Prevent duplicate names (case-insensitive)
		const existing = await getParticipants(game.gameId);
		const duplicate = existing.find(
			(p) => p.name.toLowerCase() === body.name!.trim().toLowerCase()
		);
		if (duplicate) {
			return { status: 409, jsonBody: { error: 'That name is already taken in this game.' } };
		}

		const participantId = randomBytes(6).toString('hex');
		const participant = {
			participantId,
			gameId: game.gameId,
			name: body.name.trim(),
			score: 0,
			buzzedIn: false,
			buzzOrder: 0,
			buzzedAt: 0
		};

		await createParticipant(participant);

		await broadcastToGame(game.gameId, 'participant-joined', [
			{
				participantId,
				name: participant.name,
				score: 0,
				buzzedIn: false,
				buzzOrder: 0
			}
		]);

		return { status: 201, jsonBody: { gameId: game.gameId, participantId } };
	}
});
