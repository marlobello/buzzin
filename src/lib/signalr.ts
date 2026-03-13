import * as signalR from '@microsoft/signalr';

export type MessageHandler = (target: string, args: unknown[]) => void;

let connection: signalR.HubConnection | null = null;

export async function connectToGame(
	gameId: string,
	userId: string,
	onMessage: MessageHandler
): Promise<void> {
	if (connection) {
		await connection.stop();
	}

	// Manually fetch the Azure SignalR Service URL and access token.
	// The @microsoft/signalr client's built-in negotiate expects the classic
	// SignalR hub protocol; Azure SignalR serverless returns {url, accessToken}
	// instead, so we must negotiate manually and connect directly to the service.
	const res = await fetch(
		`/api/negotiate?gameId=${encodeURIComponent(gameId)}&userId=${encodeURIComponent(userId)}`
	);
	if (!res.ok) throw new Error(`Negotiate failed: ${res.status}`);
	const { url, accessToken } = (await res.json()) as { url: string; accessToken: string };

	connection = new signalR.HubConnectionBuilder()
		.withUrl(url, { accessTokenFactory: () => accessToken })
		.withAutomaticReconnect()
		.configureLogging(signalR.LogLevel.Warning)
		.build();

	const events = [
		'participant-joined',
		'game-started',
		'buzzed-in',
		'buzzers-reset',
		'scores-updated',
		'game-ended'
	];

	for (const event of events) {
		connection.on(event, (...args) => onMessage(event, args));
	}

	await connection.start();
}

export async function disconnect(): Promise<void> {
	if (connection) {
		await connection.stop();
		connection = null;
	}
}
