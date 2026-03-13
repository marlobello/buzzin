import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, deleteGameData } from '../storage';
import { broadcastToGame } from '../signalr';

app.http('gamesDelete', {
	methods: ['DELETE'],
	authLevel: 'anonymous',
	route: 'games/{gameId}',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		const body = (await request.json().catch(() => null)) as { moderatorId?: string } | null;

		const game = await getGame(gameId);
		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		if (game.moderatorId !== body?.moderatorId) {
			return { status: 403, jsonBody: { error: 'Not authorized' } };
		}

		// Notify all participants before deleting
		await broadcastToGame(gameId, 'game-ended', []).catch(() => {});

		await deleteGameData(gameId, game.joinCode);

		return { status: 204 };
	}
});
