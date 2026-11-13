/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) {
        audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
        return noiseBuffer;
    }
    const duration = 0.4;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Slightly smoothed noise for natural paper texture rather than harsh static
    let last = 0;
    for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.35 * white) / 1.35;
        data[i] = last * 1.6;
    }
    noiseBuffer = buffer;
    return buffer;
}

/**
 * Synthesizes a glossy comic-book page-turn sound effect using the Web Audio API.
 */
export function playPageTurnSound(direction: 'forward' | 'backward' = 'forward'): void {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const buffer = getNoiseBuffer(ctx);

        // Layer 1: Swept bandpass noise for the paper whoosh / air movement
        const whooshSource = ctx.createBufferSource();
        whooshSource.buffer = buffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.Q.setValueAtTime(1.1, now);

        if (direction === 'forward') {
            bandpass.frequency.setValueAtTime(750, now);
            bandpass.frequency.exponentialRampToValueAtTime(2400, now + 0.11);
            bandpass.frequency.exponentialRampToValueAtTime(1100, now + 0.3);
        } else {
            bandpass.frequency.setValueAtTime(1100, now);
            bandpass.frequency.exponentialRampToValueAtTime(1950, now + 0.11);
            bandpass.frequency.exponentialRampToValueAtTime(720, now + 0.3);
        }

        const whooshGain = ctx.createGain();
        whooshGain.gain.setValueAtTime(0.0001, now);
        whooshGain.gain.linearRampToValueAtTime(0.24, now + 0.045);
        whooshGain.gain.exponentialRampToValueAtTime(0.09, now + 0.14);
        whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.31);

        whooshSource.connect(bandpass);
        bandpass.connect(whooshGain);
        whooshGain.connect(ctx.destination);

        whooshSource.start(now);
        whooshSource.stop(now + 0.33);

        // Layer 2: Subtle high-frequency paper edge crispness / settle flick
        const crispSource = ctx.createBufferSource();
        crispSource.buffer = buffer;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(2800, now);

        const crispGain = ctx.createGain();
        const flickStart = now + 0.08;
        crispGain.gain.setValueAtTime(0.0001, flickStart);
        crispGain.gain.linearRampToValueAtTime(0.075, flickStart + 0.015);
        crispGain.gain.exponentialRampToValueAtTime(0.0001, flickStart + 0.09);

        crispSource.connect(highpass);
        highpass.connect(crispGain);
        crispGain.connect(ctx.destination);

        crispSource.start(flickStart, 0.05, 0.12);
    } catch {
        // Ignore audio playback errors in restricted environments
    }
}
