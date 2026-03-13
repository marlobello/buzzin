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

	connection = new signalR.HubConnectionBuilder()
		.withUrl(`/api/negotiate?gameId=${gameId}&userId=${encodeURIComponent(userId)}`)
		.withAutomaticReconnect()
		.configureLogging(signalR.LogLevel.Warning)
		.build();

	const events = [
		'participant-joined',
		'game-started',
		'buzzed-in',
		'buzzers-reset',
		'scores-updated'
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
