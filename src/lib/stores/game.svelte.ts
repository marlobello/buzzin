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

class GameStore {
	current = $state<GameState | null>(null);

	set(value: GameState | null) {
		this.current = value;
	}

	get buzzOrder(): Participant[] {
		return this.current
			? [...this.current.participants]
					.filter((p) => p.buzzedIn)
					.sort((a, b) => a.buzzOrder - b.buzzOrder)
			: [];
	}

	handleMessage(target: string, args: unknown[]) {
		const [msgGameId, ...payload] = args as [string, ...unknown[]];

		if (!this.current || this.current.gameId !== msgGameId) return;

		const s = this.current;

		switch (target) {
			case 'participant-joined': {
				const p = payload[0] as Participant;
				this.current = { ...s, participants: [...s.participants, p] };
				break;
			}
			case 'game-started': {
				this.current = {
					...s,
					status: 'active',
					participants: s.participants.map((p) => ({ ...p, buzzedIn: false, buzzOrder: 0 }))
				};
				break;
			}
			case 'buzzed-in': {
				const { participantId, buzzOrder } = payload[0] as {
					participantId: string;
					buzzOrder: number;
				};
				this.current = {
					...s,
					participants: s.participants.map((p) =>
						p.participantId === participantId ? { ...p, buzzedIn: true, buzzOrder } : p
					)
				};
				break;
			}
			case 'buzzers-reset': {
				this.current = {
					...s,
					participants: s.participants.map((p) => ({ ...p, buzzedIn: false, buzzOrder: 0 }))
				};
				break;
			}
			case 'scores-updated': {
				const scores = payload[0] as Array<{ participantId: string; score: number }>;
				this.current = {
					...s,
					participants: s.participants.map((p) => {
						const found = scores.find((sc) => sc.participantId === p.participantId);
						return found ? { ...p, score: found.score } : p;
					})
				};
				break;
			}
			case 'game-ended': {
				this.current = { ...s, status: 'ended' };
				break;
			}
		}
	}
}

export const gameStore = new GameStore();
