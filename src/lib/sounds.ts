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

		// Layer 1: sawtooth for the buzzy core tone
		const osc1 = ctx.createOscillator();
		osc1.type = 'sawtooth';
		osc1.frequency.setValueAtTime(280, now);
		osc1.frequency.exponentialRampToValueAtTime(120, now + duration);

		// Layer 2: square wave an octave up for presence
		const osc2 = ctx.createOscillator();
		osc2.type = 'square';
		osc2.frequency.setValueAtTime(560, now);
		osc2.frequency.exponentialRampToValueAtTime(240, now + duration);

		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.75, now + 0.015);
		gain.gain.setValueAtTime(0.75, now + 0.1);
		gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(ctx.destination);

		osc1.start(now); osc1.stop(now + duration);
		osc2.start(now); osc2.stop(now + duration);
	} catch {
		// Silently ignore if audio is unavailable
	}
}
