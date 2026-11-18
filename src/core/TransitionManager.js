import { gsap } from './gsap.js';

function tween(target, vars, signal, trackAnimation) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(false); return; }
    let animation, settled = false;
    const finish = (completed) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (animation) trackAnimation(animation, false);
      resolve(completed);
    };
    const abort = () => { animation?.kill(); finish(false); };
    signal?.addEventListener('abort', abort, { once: true });
    animation = gsap.to(target, { ...vars, onComplete: () => finish(true) });
    trackAnimation(animation, true);
  });
}

/**
 * Реестр переходов между сценами. Контракт перехода:
 *   async fn({ from, to, swap, app, duration }) — в нужный момент ОБЯЗАН вызвать `await swap()`:
 *   swap выгружает старую сцену, строит и запускает новую.
 *
 * Phase 1: 'cut' и 'dip' (затемнение). 'matchCut' (объект в объект: синхронные позиция, масштаб,
 * поворот) — Phase 2; пока он безопасно деградирует до 'dip' с предупреждением в консоли.
 */
export class TransitionManager {
  constructor(app) {
    this.app = app;
    this.veil = globalThis.document?.getElementById('veil') ?? null;
    this.registry = new Map();
    this._active = null;
    this.register('cut', async ({ swap }) => { await swap(); });
    this.register('fadeOut', async ({ duration = 0.5, ease = 'power2.in', signal, trackAnimation }) => {
      if (this.veil) await tween(this.veil, { opacity: 1, duration, ease }, signal, trackAnimation);
    });
    this.register('fadeIn', async ({ duration = 0.5, ease = 'power2.out', signal, trackAnimation }) => {
      if (this.veil) await tween(this.veil, { opacity: 0, duration, ease }, signal, trackAnimation);
    });
    this.register('dip', async ({ swap, duration = 1.0, signal, trackAnimation }) => {
      if (!this.veil) { await swap(); return; }
      if (!await tween(this.veil, { opacity: 1, duration: duration * 0.4, ease: 'power2.in' }, signal, trackAnimation)) return;
      await swap();
      if (!signal.aborted) await tween(this.veil, { opacity: 0, duration: duration * 0.6, ease: 'power2.out' }, signal, trackAnimation);
    });
    let warned = false;
    this.register('matchCut', (ctx) => {
      if (!warned) { console.warn('[TransitionManager] matchCut — Phase 2, пока используется dip'); warned = true; }
      return this.registry.get('dip')(ctx);
    });
  }

  register(name, fn) { this.registry.set(name, fn); }

  async run(name, ctx = {}) {
    const previous = this._active;
    if (previous && !this.cancel()) await previous.done;
    const fn = this.registry.get(name) ?? this.registry.get('dip');
    const controller = new AbortController();
    let resolveCancelled;
    const cancelled = new Promise((resolve) => { resolveCancelled = resolve; });
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const active = { controller, animations: new Set(), resolveCancelled, done, swapStarted: false };
    this._active = active;
    let swapPromise = null;
    const swap = () => {
      if (swapPromise) return swapPromise;
      if (controller.signal.aborted) return Promise.resolve(false);
      active.swapStarted = true;
      swapPromise = Promise.resolve().then(() => ctx.swap?.())
        .finally(() => { active.swapStarted = false; });
      return swapPromise;
    };
    const trackAnimation = (animation, activeAnimation) => {
      if (activeAnimation) active.animations.add(animation);
      else active.animations.delete(animation);
    };
    const work = Promise.resolve().then(() => fn({
      app: this.app, ...ctx, swap, signal: controller.signal, trackAnimation,
    })).then(() => ({ cancelled: false }));
    try {
      return await Promise.race([work, cancelled]);
    } catch (error) {
      if (this._active === active) {
        controller.abort();
        for (const animation of active.animations) animation.kill();
        active.animations.clear();
        if (this.veil) {
          if (this.veil.style) this.veil.style.opacity = '0';
          else this.veil.opacity = 0;
        }
      }
      throw error;
    } finally {
      if (this._active === active) {
        for (const animation of active.animations) animation.kill();
        active.animations.clear();
        this._active = null;
      }
      resolveDone();
    }
  }

  cancel() {
    const active = this._active;
    if (!active || active.swapStarted) return false;
    active.controller.abort();
    for (const animation of active.animations) animation.kill();
    active.animations.clear();
    if (this.veil) {
      if (this.veil.style) this.veil.style.opacity = '0';
      else this.veil.opacity = 0;
    }
    active.resolveCancelled({ cancelled: true });
    this._active = null;
    return true;
  }

  fadeIn(options) { return this.run('fadeIn', options); }
  fadeOut(options) { return this.run('fadeOut', options); }

  dispose() {
    if (this._active) this._active.swapStarted = false;
    this.cancel();
    this.registry.clear();
  }
}
