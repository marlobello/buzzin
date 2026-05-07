import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, deleteGameData } from '../storage';

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

		// Delete game data (game-ended was already broadcast by /end endpoint)
		await deleteGameData(gameId, game.joinCode);

		return { status: 204 };
	}
});
