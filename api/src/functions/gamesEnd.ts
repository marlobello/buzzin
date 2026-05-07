import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, getParticipants, updateGameStatus } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesEnd', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/{gameId}/end',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as { moderatorId?: string } | null;

		const game = await getGame(gameId);
		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (game.moderatorId !== body?.moderatorId) {
			return { status: 403, jsonBody: { error: 'Not authorized' } };
		}
		if (game.status === 'ended') {
			return { status: 409, jsonBody: { error: 'Game already ended' } };
		}

		await updateGameStatus(gameId, 'ended');

		const participants = await getParticipants(gameId);
		const finalScores = participants
			.map((p) => ({ participantId: p.participantId, name: p.name, score: p.score }))
			.sort((a, b) => b.score - a.score);

		await broadcastToGame(gameId, 'game-ended', [{ finalScores }]);

		return { jsonBody: { ok: true, finalScores } };
	}
});
