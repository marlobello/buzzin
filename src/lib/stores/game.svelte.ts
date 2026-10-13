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
	buzzersExpireAt: number;
	buzzRevision: number;
	participants: Participant[];
	finalScores?: Array<{ participantId: string; name: string; score: number }>;
}

const BUZZ_LIMIT = 3;

interface BuzzerState {
	buzzersExpireAt: number;
	buzzRevision: number;
	buzzList: Array<{ participantId: string; buzzOrder: number }>;
}

class GameStore {
	current = $state<GameState | null>(null);
	buzzWindowExpired = $state(true);
	private expiryTimer: ReturnType<typeof setTimeout> | undefined;

	set(value: GameState | null) {
		this.current = value;
		this.scheduleExpiry();
	}

	private scheduleExpiry() {
		clearTimeout(this.expiryTimer);
		const remaining = (this.current?.buzzersExpireAt ?? 0) - Date.now();
		this.buzzWindowExpired = remaining <= 0;
		if (remaining > 0 && this.current?.status === 'active') {
			this.expiryTimer = setTimeout(() => {
				this.buzzWindowExpired = true;
			}, remaining);
		}
	}

	private applyBuzzerState(state: BuzzerState) {
		const game = this.current;
		if (!game || state.buzzRevision < game.buzzRevision) return;
		this.current = {
			...game,
			buzzersExpireAt: state.buzzersExpireAt,
			buzzRevision: state.buzzRevision,
			participants: game.participants.map((p) => {
				const buzz = state.buzzList.find((b) => b.participantId === p.participantId);
				return { ...p, buzzedIn: !!buzz, buzzOrder: buzz?.buzzOrder ?? 0 };
			})
		};
		this.scheduleExpiry();
	}

	get buzzOrder(): Participant[] {
		return this.current
			? [...this.current.participants]
					.filter((p) => p.buzzedIn)
					.sort((a, b) => a.buzzOrder - b.buzzOrder)
			: [];
	}

	get buzzLimitReached(): boolean {
		return this.buzzOrder.length >= BUZZ_LIMIT;
	}

	get buzzersDisabled(): boolean {
		return this.buzzWindowExpired || this.buzzLimitReached;
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
				if (s.status === 'ended') break;
				this.current = {
					...s,
					status: 'active'
				};
				this.applyBuzzerState(payload[0] as BuzzerState);
				this.scheduleExpiry();
				break;
			}
			case 'buzzed-in':
			case 'unbuzzed':
			case 'buzzers-reset': {
				this.applyBuzzerState(payload[0] as BuzzerState);
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
				const data = payload[0] as
					| { finalScores: Array<{ participantId: string; name: string; score: number }> }
					| undefined;
				this.current = {
					...s,
					status: 'ended',
					finalScores: data?.finalScores
				};
				clearTimeout(this.expiryTimer);
				break;
			}
		}
	}
}

export const gameStore = new GameStore();
