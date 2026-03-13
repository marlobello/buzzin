let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx || audioCtx.state === 'closed') {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

/** Pleasant "da-DING!" two-note chime played when the first participant buzzes in.
 *  Emulates the classic quiz-show buzz-in: a short grace note followed by a
 *  bright sustained bell tone. Uses triangle waves for warmth over harshness. */
export function playBuzzSound(): void {
	try {
		const ctx = getAudioContext();
		if (ctx.state === 'suspended') ctx.resume();

		const now = ctx.currentTime;

		// Grace note — short lower tone (D5)
		const grace = ctx.createOscillator();
		grace.type = 'triangle';
		grace.frequency.setValueAtTime(587, now);

		const graceGain = ctx.createGain();
		graceGain.gain.setValueAtTime(0, now);
		graceGain.gain.linearRampToValueAtTime(0.35, now + 0.008);
		graceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

		grace.connect(graceGain);
		graceGain.connect(ctx.destination);
		grace.start(now);
		grace.stop(now + 0.07);

		// Main ding — bright A5, bell-like decay
		const ding = ctx.createOscillator();
		ding.type = 'triangle';
		ding.frequency.setValueAtTime(880, now + 0.055);

		// Add a touch of shimmer with a soft overtone at 2x frequency
		const shimmer = ctx.createOscillator();
		shimmer.type = 'sine';
		shimmer.frequency.setValueAtTime(1760, now + 0.055);

		const dingGain = ctx.createGain();
		dingGain.gain.setValueAtTime(0, now + 0.055);
		dingGain.gain.linearRampToValueAtTime(0.7, now + 0.07);
		dingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

		const shimmerGain = ctx.createGain();
		shimmerGain.gain.setValueAtTime(0, now + 0.055);
		shimmerGain.gain.linearRampToValueAtTime(0.15, now + 0.07);
		shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

		ding.connect(dingGain);
		shimmer.connect(shimmerGain);
		dingGain.connect(ctx.destination);
		shimmerGain.connect(ctx.destination);

		ding.start(now + 0.055); ding.stop(now + 0.5);
		shimmer.start(now + 0.055); shimmer.stop(now + 0.35);
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
