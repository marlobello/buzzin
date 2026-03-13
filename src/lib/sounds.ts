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

		// Resume in case browser suspended it
		if (ctx.state === 'suspended') ctx.resume();

		const now = ctx.currentTime;
		const duration = 0.25;

		// Sawtooth oscillator for a buzzer-like tone
		const osc = ctx.createOscillator();
		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(220, now);
		osc.frequency.exponentialRampToValueAtTime(110, now + duration);

		// Gain envelope: quick attack, fast decay
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + duration);
	} catch {
		// Silently ignore if audio is unavailable
	}
}
