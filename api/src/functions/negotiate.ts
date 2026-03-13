import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getClientAccessUrl } from '../signalr';
import { getGame } from '../storage';

app.http('negotiate', {
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	route: 'negotiate',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const gameId = request.query.get('gameId');
		const userId = request.query.get('userId');

		if (!gameId || !userId) {
			return { status: 400, jsonBody: { error: 'gameId and userId are required' } };
		}

		const game = await getGame(gameId);
		if (!game) {
			return { status: 404, jsonBody: { error: 'Game not found' } };
		}

		try {
			const info = getClientAccessUrl(userId, gameId);
			return { jsonBody: info };
		} catch {
			return { status: 500, jsonBody: { error: 'Failed to negotiate SignalR connection' } };
		}
	}
});
