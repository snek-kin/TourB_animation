import { gsap } from './gsap.js';

/**
 * Звук через Web Audio. Браузер запрещает автозапуск — unlock() вызывается по клику «Начать».
 * Файлов пока нет (см. assets/ASSET_INVENTORY.md): play() для отсутствующего ключа молча
 * возвращает null, сцены работают без звука.
 */
export class AudioManager {
  constructor(assets) {
    this.assets = assets;
    this.ctx = null; this.master = null;
    this.muted = false;
    this._buffers = new Map();
    this._playing = new Map();
  }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  async play(key, { loop = false, volume = 1, fadeIn = 0 } = {}) {
    if (!this.ctx) return null;
    const raw = this.assets.get(key);
    if (!raw) return null;
    let buf = this._buffers.get(key);
    if (!buf) { buf = await this.ctx.decodeAudioData(raw.slice(0)); this._buffers.set(key, buf); }
    this.stop(key);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf; src.loop = loop;
    src.connect(gain).connect(this.master);
    gain.gain.value = fadeIn ? 0 : volume;
    if (fadeIn) gsap.to(gain.gain, { value: volume, duration: fadeIn });
    src.start();
    this._playing.set(key, { src, gain });
    return src;
  }

  stop(key, { fadeOut = 0 } = {}) {
    const p = this._playing.get(key);
    if (!p) return;
    this._playing.delete(key);
    const end = () => { try { p.src.stop(); } catch { /* уже остановлен */ } };
    if (fadeOut) gsap.to(p.gain.gain, { value: 0, duration: fadeOut, onComplete: end }); else end();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  dispose() { for (const k of [...this._playing.keys()]) this.stop(k); this.ctx?.close(); }
}
