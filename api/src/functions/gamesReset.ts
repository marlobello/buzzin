import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, resetAllBuzzers, BUZZ_WINDOW_MS } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesReset', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games/{gameId}/reset',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as { moderatorId?: string } | null;

		const game = await getGame(gameId);
		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (game.moderatorId !== body?.moderatorId) {
			return { status: 403, jsonBody: { error: 'Not authorized' } };
		}

		if (game.status !== 'active') {
			return { status: 409, jsonBody: { error: 'Game is not active' } };
		}
		const state = await resetAllBuzzers(gameId, Date.now() + BUZZ_WINDOW_MS);
		await broadcastToGame(gameId, 'buzzers-reset', [state]);

		return { jsonBody: { ok: true, ...state } };
	}
});
