let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep(freq: number, duration: number, delay = 0, gain = 0.25) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  const start = c.currentTime + delay;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.linearRampToValueAtTime(0, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** 3 short beeps — generic incoming message */
export function playIncomingBeep() {
  beep(880, 0.08);
  beep(880, 0.08, 0.14);
  beep(880, 0.08, 0.28);
}

/** 2-tone ascending chime — CPDLC uplink */
export function playCpdlcChime() {
  beep(660, 0.12);
  beep(880, 0.18, 0.18);
}

/** Single soft tone — OPS / auto-phase message */
export function playOpsBeep() {
  beep(440, 0.15);
}
