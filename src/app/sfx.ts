// His sound effects, made in code with the Web Audio API (no sound files): footsteps,
// thuds, an "oof" when he crashes, snaps and clicks for his limbs, whooshes for his
// sword... Each one is a few oscillators and bursts of noise shaped with envelopes,
// the way old game consoles made sounds.

let audio: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
const lastPlayed: Record<string, number> = {};

/** The shared audio context (browsers only allow sound after a click; Electron is set to allow it). */
export function audioCtx(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  } catch { return null; }
}

function noise(a: AudioContext) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A tone: type, start/end pitch (Hz), length (s), loudness, delay (s). */
function tone(a: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, len: number, vol: number, delay = 0) {
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + len + 0.02);
}

/** A burst of noise through a filter whose frequency sweeps from f0 to f1. */
function hiss(a: AudioContext, out: AudioNode, filter: BiquadFilterType, f0: number, f1: number, len: number, vol: number, delay = 0, q = 1) {
  const t = a.currentTime + delay, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise(a);
  f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.3); src.stop(t + len + 0.02);
}

/** Minimum seconds between two of the same sound (so a pile of events doesn't turn into a buzz). */
const GAP: Record<string, number> = { step: 0.07, scribble: 0.06, thud: 0.08, kick: 0.08, bonk: 0.1, poke: 0.05, punch: 0.06, knock: 0.08 };

/**
 * Play a sound effect. `strength` 0..1 scales it (a small landing vs a big one),
 * `volume` is the master volume from his settings, `pitch` shifts voice-like sounds.
 */
export function playSfx(name: string, strength = 1, volume = 0.6, pitch = 1) {
  const a = audioCtx();
  if (!a || volume <= 0) return;
  const now = a.currentTime;
  if (now - (lastPlayed[name] ?? -1) < (GAP[name] ?? 0.03)) return;
  lastPlayed[name] = now;
  const s = Math.max(0.05, Math.min(1, strength));
  const out = a.createGain();
  out.gain.value = volume * 0.9;
  out.connect(a.destination);
  const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  switch (name) {
    case 'step': // a soft tap
      hiss(a, out, 'lowpass', r(1400, 2200), 400, 0.05, 0.05 * s);
      tone(a, out, 'sine', r(150, 190), 70, 0.05, 0.05 * s);
      break;
    case 'thud': // landing
      tone(a, out, 'sine', 110, 45, 0.18, 0.28 * s);
      hiss(a, out, 'lowpass', 900, 150, 0.12, 0.12 * s);
      break;
    case 'crash':
      tone(a, out, 'sine', 95, 35, 0.3, 0.38 * s);
      hiss(a, out, 'lowpass', 1600, 120, 0.22, 0.2 * s);
      break;
    case 'oof': // his voice: a squashed little "oof"
      tone(a, out, 'square', 330 * pitch, 190 * pitch, 0.16, 0.05);
      tone(a, out, 'square', 260 * pitch, 150 * pitch, 0.14, 0.04, 0.08);
      break;
    case 'snap': // a limb coming off: crack and a falling chirp
      hiss(a, out, 'highpass', 3000, 1200, 0.06, 0.22);
      tone(a, out, 'square', 1400, 300, 0.18, 0.06, 0.02);
      break;
    case 'click': // and going back on
      tone(a, out, 'square', 900, 900, 0.03, 0.06);
      tone(a, out, 'square', 1300, 1300, 0.04, 0.06, 0.06);
      break;
    case 'shot': hiss(a,out,'highpass',2400,600,0.08,s*0.55); tone(a,out,'square',160,50,0.1,s*0.25); break;
    case 'whoosh': // sword swing
      hiss(a, out, 'bandpass', 500, 2600, 0.2, 0.22, 0, 2.5);
      break;
    case 'clang': // wooden sword hits your cursor: a woody "tock"
      tone(a, out, 'triangle', 780, 620, 0.09, 0.22);
      tone(a, out, 'sine', 1560, 1200, 0.05, 0.08);
      hiss(a, out, 'bandpass', 2500, 2000, 0.03, 0.12, 0, 4);
      break;
    case 'thwack': // you hit him with his sword
      hiss(a, out, 'bandpass', 1800, 600, 0.09, 0.3 * s, 0, 1.5);
      tone(a, out, 'sine', 140, 60, 0.14, 0.25 * s);
      break;
    case 'smack': // a swipe of your cursor
      hiss(a, out, 'highpass', 2200, 900, 0.07, 0.25 * s);
      tone(a, out, 'sine', 170, 80, 0.08, 0.15 * s);
      break;
    case 'clap': // hands meeting (high fives, patty cake)
      hiss(a, out, 'bandpass', 2200, 1400, 0.05, 0.3 * s, 0, 2);
      tone(a, out, 'sine', 240, 150, 0.04, 0.08 * s);
      break;
    case 'poke':
      tone(a, out, 'sine', 520, 760, 0.07, 0.08);
      break;
    case 'pickup':
      tone(a, out, 'square', 660, 660, 0.05, 0.03 * s + 0.01);
      tone(a, out, 'square', 990, 990, 0.06, 0.03 * s + 0.01, 0.05);
      break;
    case 'drop':
      tone(a, out, 'square', 520, 300, 0.09, 0.03);
      break;
    case 'jump':
      tone(a, out, 'square', 260, 520, 0.09, 0.025 * s + 0.01);
      break;
    case 'kick': // foot meets ball
      tone(a, out, 'sine', 220, 90, 0.1, 0.3 * s);
      hiss(a, out, 'lowpass', 2500, 400, 0.05, 0.12 * s);
      break;
    case 'bonk': // cartoon bonk
      tone(a, out, 'sine', 950, 280, 0.16, 0.25 * s);
      break;
    case 'roll': // tumbling: two soft bumps
      tone(a, out, 'sine', 120, 60, 0.08, 0.16);
      tone(a, out, 'sine', 110, 55, 0.09, 0.13, 0.17);
      break;
    case 'poof': // a drawing comes to life: a puff and a little rising chime
      hiss(a, out, 'lowpass', 3500, 300, 0.25, 0.14);
      tone(a, out, 'square', 880, 880, 0.05, 0.03, 0.05);
      tone(a, out, 'square', 1320, 1320, 0.07, 0.03, 0.1);
      tone(a, out, 'square', 1760, 1760, 0.1, 0.025, 0.15);
      break;
    case 'punch': // his fist meets your cursor: a snappy little "pap"
      hiss(a, out, 'bandpass', 2400, 900, 0.06, 0.28 * s, 0, 1.8);
      tone(a, out, 'square', 300, 120, 0.07, 0.06 * s);
      tone(a, out, 'sine', 180, 70, 0.1, 0.2 * s);
      break;
    case 'knock': // knuckles on a window
      tone(a, out, 'triangle', r(330, 380), 260, 0.07, 0.22);
      hiss(a, out, 'bandpass', 1400, 900, 0.03, 0.08, 0, 3);
      break;
    case 'scribble': // pen on the screen
      hiss(a, out, 'highpass', r(3000, 5000), 2500, 0.04, 0.03);
      break;
  }
}

/** One blip of his talking voice (a little square wave). */
export function playBlip(pitch: number, volume = 0.6) {
  const a = audioCtx();
  if (!a || volume <= 0) return;
  const t = a.currentTime, osc = a.createOscillator(), gain = a.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(pitch, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.06 * volume, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}
