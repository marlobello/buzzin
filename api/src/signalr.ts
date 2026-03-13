import { createHmac } from 'crypto';

const HUB = 'buzzin';

interface ConnectionString {
	endpoint: string;
	accessKey: string;
}

function parse(cs: string): ConnectionString {
	const endpoint = cs.match(/Endpoint=([^;]+)/)?.[1]?.replace(/\/$/, '');
	const accessKey = cs.match(/AccessKey=([^;]+)/)?.[1];
	if (!endpoint || !accessKey) throw new Error('Invalid AZURE_SIGNALR_CONNECTION_STRING');
	return { endpoint, accessKey };
}

function b64url(obj: unknown): string {
	return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function jwt(
	audience: string,
	key: string,
	extra: Record<string, unknown> = {},
	ttl = 3600
): string {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url({ alg: 'HS256', typ: 'JWT' });
	const payload = b64url({ aud: audience, iat: now, exp: now + ttl, nbf: now, ...extra });
	const sig = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url');
	return `${header}.${payload}.${sig}`;
}

export function getClientAccessUrl(
	userId: string,
	gameId: string
): { url: string; accessToken: string } {
	const { endpoint, accessKey } = parse(process.env.AZURE_SIGNALR_CONNECTION_STRING!);
	const url = `${endpoint}/client/?hub=${HUB}`;
	const accessToken = jwt(url, accessKey, {
		nameid: userId,
		'asrs.s.ogl': `game-${gameId}` // pre-assigns client to the game group on connect
	});
	return { url, accessToken };
}

export async function broadcastToGame(
	gameId: string,
	target: string,
	args: unknown[]
): Promise<void> {
	const { endpoint, accessKey } = parse(process.env.AZURE_SIGNALR_CONNECTION_STRING!);
	const group = `game-${gameId}`;
	const apiUrl = `${endpoint}/api/v1/hubs/${HUB}/groups/${encodeURIComponent(group)}`;
	const token = jwt(apiUrl, accessKey);

	const res = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ target, arguments: args })
	});

	if (!res.ok && res.status !== 202) {
		const text = await res.text();
		throw new Error(`SignalR broadcast failed: ${res.status} ${text}`);
	}
}
