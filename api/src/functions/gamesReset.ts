import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, resetAllBuzzers } from '../storage';
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

		await resetAllBuzzers(gameId);
		await broadcastToGame(gameId, 'buzzers-reset', []);

		return { jsonBody: { ok: true } };
	}
});
