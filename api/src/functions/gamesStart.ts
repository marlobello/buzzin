import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, updateGameStatus, resetAllBuzzers } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesStart', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/{gameId}/start',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as { moderatorId?: string } | null;

		const game = await getGame(gameId);
		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (game.moderatorId !== body?.moderatorId) {
			return { status: 403, jsonBody: { error: 'Not authorized' } };
		}
		if (game.status !== 'waiting') {
			return { status: 409, jsonBody: { error: 'Game is already started' } };
		}

		await updateGameStatus(gameId, 'active');
		await resetAllBuzzers(gameId);
		await broadcastToGame(gameId, 'game-started', []);

		return { jsonBody: { ok: true } };
	}
});
