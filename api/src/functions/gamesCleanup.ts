import { app, InvocationContext, Timer } from '@azure/functions';
import { getAllGames, deleteGameData } from '../storage';

const STALE_HOURS = 12;

app.timer('gamesCleanup', {
	// Runs every 4 hours
	schedule: '0 0 */4 * * *',
	handler: async (_timer: Timer, context: InvocationContext): Promise<void> => {
		const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
		let cleaned = 0;

		try {
			const games = await getAllGames();
			await Promise.all(
				games.map(async (game) => {
					if (new Date(game.createdAt) < cutoff) {
						await deleteGameData(game.gameId, game.joinCode).catch(() => {});
						cleaned++;
					}
				})
			);
			context.log(`Cleanup: removed ${cleaned} stale game(s) older than ${STALE_HOURS}h`);
		} catch (err) {
			context.error('Cleanup failed:', err);
		}
	}
});
