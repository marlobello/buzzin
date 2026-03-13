import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomBytes } from 'crypto';
import { createGame, joinCodeExists } from '../storage';

function generateGameId(): string {
	return randomBytes(4).toString('hex');
}

function generateJoinCode(): string {
	// Exclude visually ambiguous characters (I, O)
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	const len = chars.length; // 24
	const limit = Math.floor(256 / len) * len; // 240 — reject bytes >= this to remove modulo bias
	const result: string[] = [];
	while (result.length < 6) {
		const bytes = randomBytes(6);
		for (const b of bytes) {
			if (b < limit) result.push(chars[b % len]);
			if (result.length === 6) break;
		}
	}
	return result.join('');
}

app.http('gamesCreate', {
	methods: ['POST'],
	authLevel: 'anonymous',
	route: 'games',
	handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
		const body = (await request.json().catch(() => null)) as { gameName?: string } | null;
		if (!body?.gameName?.trim()) {
			return { status: 400, jsonBody: { error: 'gameName is required' } };
		}
		if (body.gameName.trim().length > 100) {
			return { status: 400, jsonBody: { error: 'gameName must be 100 characters or fewer' } };
		}

		const gameId = generateGameId();
		const moderatorId = `mod-${randomBytes(6).toString('hex')}`;

		// Ensure unique join code
		let joinCode = generateJoinCode();
		let attempts = 0;
		while ((await joinCodeExists(joinCode)) && attempts++ < 10) {
			joinCode = generateJoinCode();
		}

		await createGame({
			gameId,
			gameName: body.gameName.trim(),
			joinCode,
			status: 'waiting',
			moderatorId,
			createdAt: new Date().toISOString()
		});

		return {
			status: 201,
			jsonBody: { gameId, joinCode, gameName: body.gameName.trim(), moderatorId }
		};
	}
});
