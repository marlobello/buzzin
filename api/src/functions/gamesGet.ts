import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getGame, getParticipants } from '../storage';

app.http('gamesGet', {
	methods: ['GET'],
	authLevel: 'anonymous',
	route: 'games/{gameId}',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.params.gameId;
		if (!gameId) return { status: 400, jsonBody: { error: 'gameId is required' } };

		const game = await getGame(gameId);
		if (!game) return { status: 404, jsonBody: { error: 'Game not found' } };
		const participants = await getParticipants(gameId, game);

		return {
			jsonBody: {
				gameId: game.gameId,
				gameName: game.gameName,
				joinCode: game.joinCode,
				status: game.status,
				buzzersExpireAt: game.buzzersExpireAt,
				buzzRevision: game.buzzRevision,
				participants
			}
		};
	}
});
