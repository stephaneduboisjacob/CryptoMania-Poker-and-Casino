import { Capacitor } from '@capacitor/core';

let Haptics = null;
if (Capacitor.isNativePlatform()) {
  import('@capacitor/haptics').then(m => { Haptics = m.Haptics; });
}

function haptic(style = 'Light') {
  if (Haptics) Haptics.impact({ style }).catch(() => {});
}

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
  }

  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return this;
  }

  setEnabled(v) { this.enabled = !!v; }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v / 100)); }

  _tone(freq, duration, type = 'sine', gain = 0.3) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      g.gain.setValueAtTime(gain * this.volume, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  _noise(duration = 0.08, gainVal = 0.15, filterFreq = 3000) {
    if (!this.enabled || !this.ctx) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.5;
      const g = this.ctx.createGain();
      src.connect(filter);
      filter.connect(g);
      g.connect(this.ctx.destination);
      g.gain.setValueAtTime(gainVal * this.volume, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      src.start();
      src.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  cardDeal() {
    this._noise(0.07, 0.18, 4000);
    haptic('Light');
  }

  chipBet() {
    this._tone(900, 0.07, 'square', 0.12);
    setTimeout(() => this._tone(700, 0.05, 'square', 0.08), 50);
    haptic('Medium');
  }

  chipCall() {
    this._tone(750, 0.06, 'square', 0.1);
    setTimeout(() => this._tone(600, 0.05, 'square', 0.07), 40);
  }

  check() {
    this._tone(440, 0.06, 'sine', 0.12);
  }

  fold() {
    this._tone(280, 0.15, 'sawtooth', 0.08);
    setTimeout(() => this._tone(220, 0.12, 'sawtooth', 0.06), 80);
  }

  win() {
    const notes = [523, 659, 784, 988, 1047];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'sine', 0.22), i * 100));
    haptic('Heavy');
  }

  lose() {
    const notes = [330, 294, 262];
    notes.forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.1), i * 130));
  }

  yourTurn() {
    this._tone(880, 0.08, 'sine', 0.2);
    setTimeout(() => this._tone(1100, 0.1, 'sine', 0.22), 100);
  }

  newCard() {
    this._noise(0.05, 0.12, 5000);
  }

  allIn() {
    [440, 554, 659].forEach((f, i) => setTimeout(() => this._tone(f, 0.2, 'square', 0.15), i * 80));
    haptic('Heavy');
  }

  buttonDraw() {
    this._noise(0.1, 0.2, 2000);
    setTimeout(() => this._tone(660, 0.15, 'sine', 0.18), 150);
  }
}

export const sound = new SoundEngine();
