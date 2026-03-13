import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, getParticipant, updateParticipant, nextBuzzOrder } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesBuzz', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/{gameId}/buzz',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as { participantId?: string } | null;

		if (!body?.participantId) {
			return { status: 400, jsonBody: { error: 'participantId is required' } };
		}

		const [game, participant] = await Promise.all([
			getGame(gameId),
			getParticipant(gameId, body.participantId)
		]);

		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (!participant) return { status: 404, jsonBody: { error: 'Participant not found' } };
		if (game.status !== 'active') {
			return { status: 409, jsonBody: { error: 'Game is not active' } };
		}
		if (participant.buzzedIn) {
			return { status: 409, jsonBody: { error: 'Already buzzed in' } };
		}

		const buzzOrder = await nextBuzzOrder(gameId);
		await updateParticipant(gameId, body.participantId, { buzzedIn: true, buzzOrder });

		await broadcastToGame(gameId, 'buzzed-in', [
			{
				participantId: body.participantId,
				name: participant.name,
				buzzOrder
			}
		]);

		return { jsonBody: { ok: true, buzzOrder } };
	}
});
