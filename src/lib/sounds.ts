let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx || audioCtx.state === 'closed') {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

/** Short game-show style buzz played when the first participant buzzes in. */
export function playBuzzSound(): void {
	try {
		const ctx = getAudioContext();

		if (ctx.state === 'suspended') ctx.resume();

		const now = ctx.currentTime;
		const duration = 0.55;

		const osc1 = ctx.createOscillator();
		osc1.type = 'sawtooth';
		osc1.frequency.setValueAtTime(280, now);
		osc1.frequency.exponentialRampToValueAtTime(120, now + duration);

		const osc2 = ctx.createOscillator();
		osc2.type = 'square';
		osc2.frequency.setValueAtTime(560, now);
		osc2.frequency.exponentialRampToValueAtTime(240, now + duration);

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.75, now + 0.015);
		gain.gain.setValueAtTime(0.75, now + 0.1);
		gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

		osc1.connect(gain); osc2.connect(gain);
		gain.connect(ctx.destination);
		osc1.start(now); osc1.stop(now + duration);
		osc2.start(now); osc2.stop(now + duration);
	} catch { /* ignore */ }
}

/** Mario-style coin ding for awarding a point. */
export function playCoinSound(): void {
	try {
		const ctx = getAudioContext();
		if (ctx.state === 'suspended') ctx.resume();

		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		// Quick two-tone jump like a coin collect
		osc.frequency.setValueAtTime(988, now);
		osc.frequency.setValueAtTime(1319, now + 0.06);

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.6, now + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.18);
	} catch { /* ignore */ }
}

/** Short descending tone for removing a point. */
export function playRemoveSound(): void {
	try {
		const ctx = getAudioContext();
		if (ctx.state === 'suspended') ctx.resume();

		const now = ctx.currentTime;

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(600, now);
		osc.frequency.exponentialRampToValueAtTime(300, now + 0.2);

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.2);
	} catch { /* ignore */ }
}
