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

// Cached at module load time — connection string doesn't change at runtime
let _parsed: ConnectionString | null = null;
function getConn(): ConnectionString {
	if (!_parsed) _parsed = parse(process.env.AZURE_SIGNALR_CONNECTION_STRING!);
	return _parsed;
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
	const { endpoint, accessKey } = getConn();
	const url = `${endpoint}/client/?hub=${HUB}`;
	const accessToken = jwt(url, accessKey, { nameid: userId });
	return { url, accessToken };
}

export async function broadcastToGame(
	gameId: string,
	target: string,
	args: unknown[]
): Promise<void> {
	const { endpoint, accessKey } = getConn();
	const apiUrl = `${endpoint}/api/v1/hubs/${HUB}`;
	const token = jwt(apiUrl, accessKey);

	const res = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ target, arguments: [gameId, ...args] })
	});

	if (!res.ok && res.status !== 202) {
		const text = await res.text();
		throw new Error(`SignalR broadcast failed: ${res.status} ${text}`);
	}
}
