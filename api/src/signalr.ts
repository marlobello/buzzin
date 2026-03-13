import { ServiceManager } from '@azure/signalr-management';

const HUB_NAME = 'buzzin';
let _manager: ServiceManager | null = null;

function manager(): ServiceManager {
	if (!_manager) {
		_manager = new ServiceManager({
			connectionString: process.env.AZURE_SIGNALR_CONNECTION_STRING!
		});
	}
	return _manager;
}

export async function getClientAccessUrl(userId: string, gameId: string): Promise<string> {
	const client = await manager().getServiceClient(HUB_NAME);
	const url = await client.getClientAccessUrl({
		userId,
		groups: [`game-${gameId}`]
	});
	// url may be a full URL with embedded access_token; split for @microsoft/signalr client
	try {
		const parsed = new URL(url);
		const accessToken = parsed.searchParams.get('access_token');
		parsed.searchParams.delete('access_token');
		if (accessToken) {
			return JSON.stringify({ url: parsed.toString(), accessToken });
		}
	} catch {
		// fallback: return raw
	}
	return JSON.stringify({ url });
}

export async function broadcastToGame(
	gameId: string,
	target: string,
	args: unknown[]
): Promise<void> {
	const client = await manager().getServiceClient(HUB_NAME);
	await client.sendToGroup(`game-${gameId}`, { target, arguments: args });
}
