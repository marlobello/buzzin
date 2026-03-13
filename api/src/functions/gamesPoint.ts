import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, getParticipant, updateParticipant, getParticipants } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesPoint', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/{gameId}/point',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as {
			participantId?: string;
			moderatorId?: string;
			remove?: boolean;
		} | null;

		if (!body?.participantId) {
			return { status: 400, jsonBody: { error: 'participantId is required' } };
		}

		const [game, participant] = await Promise.all([
			getGame(gameId),
			getParticipant(gameId, body.participantId)
		]);

		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (game.moderatorId !== body.moderatorId) {
			return { status: 403, jsonBody: { error: 'Not authorized' } };
		}
		if (!participant) return { status: 404, jsonBody: { error: 'Participant not found' } };

		const newScore = Math.max(0, participant.score + (body.remove ? -1 : 1));
		await updateParticipant(gameId, body.participantId, { score: newScore });

		// Broadcast updated scores for all participants
		const all = await getParticipants(gameId);
		const scores = all.map((p) => ({
			participantId: p.participantId,
			name: p.name,
			score: p.participantId === body.participantId ? newScore : p.score
		}));

		await broadcastToGame(gameId, 'scores-updated', [scores]);

		return { jsonBody: { ok: true, score: newScore } };
	}
});
