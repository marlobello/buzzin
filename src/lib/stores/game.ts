import { writable, derived } from 'svelte/store';

export interface Participant {
	participantId: string;
	name: string;
	score: number;
	buzzedIn: boolean;
	buzzOrder: number;
}

export interface GameState {
	gameId: string;
	gameName: string;
	joinCode: string;
	status: 'waiting' | 'active' | 'ended';
	participants: Participant[];
}

function createGameStore() {
	const { subscribe, set, update } = writable<GameState | null>(null);

	return {
		subscribe,
		set,
		handleMessage(target: string, args: unknown[]) {
			// Every broadcast prepends gameId as args[0] so we can filter
			const [msgGameId, ...payload] = args as [string, ...unknown[]];

			update((s) => {
				if (!s || s.gameId !== msgGameId) return s;

				switch (target) {
					case 'participant-joined': {
						const p = payload[0] as Participant;
						return { ...s, participants: [...s.participants, p] };
					}
					case 'game-started': {
						return {
							...s,
							status: 'active',
							participants: s.participants.map((p) => ({ ...p, buzzedIn: false, buzzOrder: 0 }))
						};
					}
					case 'buzzed-in': {
						const { participantId, buzzOrder } = payload[0] as {
							participantId: string;
							buzzOrder: number;
						};
						return {
							...s,
							participants: s.participants.map((p) =>
								p.participantId === participantId ? { ...p, buzzedIn: true, buzzOrder } : p
							)
						};
					}
					case 'buzzers-reset': {
						return {
							...s,
							participants: s.participants.map((p) => ({ ...p, buzzedIn: false, buzzOrder: 0 }))
						};
					}
					case 'scores-updated': {
						const scores = payload[0] as Array<{ participantId: string; score: number }>;
						return {
							...s,
							participants: s.participants.map((p) => {
								const found = scores.find((sc) => sc.participantId === p.participantId);
								return found ? { ...p, score: found.score } : p;
							})
						};
					}
					default:
						return s;
				}
			});
		}
	};
}

export const gameStore = createGameStore();

export const buzzOrder = derived(gameStore, ($game) =>
	$game
		? [...$game.participants]
				.filter((p) => p.buzzedIn)
				.sort((a, b) => a.buzzOrder - b.buzzOrder)
		: []
);
