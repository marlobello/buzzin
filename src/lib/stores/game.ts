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
			switch (target) {
				case 'participant-joined': {
					const p = args[0] as Participant;
					update((s) => (s ? { ...s, participants: [...s.participants, p] } : null));
					break;
				}
				case 'game-started': {
					update((s) =>
						s
							? {
									...s,
									status: 'active',
									participants: s.participants.map((p) => ({
										...p,
										buzzedIn: false,
										buzzOrder: 0
									}))
								}
							: null
					);
					break;
				}
				case 'buzzed-in': {
					const { participantId, buzzOrder } = args[0] as {
						participantId: string;
						buzzOrder: number;
					};
					update((s) =>
						s
							? {
									...s,
									participants: s.participants.map((p) =>
										p.participantId === participantId ? { ...p, buzzedIn: true, buzzOrder } : p
									)
								}
							: null
					);
					break;
				}
				case 'buzzers-reset': {
					update((s) =>
						s
							? {
									...s,
									participants: s.participants.map((p) => ({
										...p,
										buzzedIn: false,
										buzzOrder: 0
									}))
								}
							: null
					);
					break;
				}
				case 'scores-updated': {
					const scores = args[0] as Array<{ participantId: string; score: number }>;
					update((s) =>
						s
							? {
									...s,
									participants: s.participants.map((p) => {
										const found = scores.find((sc) => sc.participantId === p.participantId);
										return found ? { ...p, score: found.score } : p;
									})
								}
							: null
					);
					break;
				}
			}
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
