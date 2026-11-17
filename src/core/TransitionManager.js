import { gsap } from './gsap.js';

const tween = (target, vars) => new Promise((resolve) => gsap.to(target, { ...vars, onComplete: resolve }));

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
    this.register('cut', async ({ swap }) => { await swap(); });
    this.register('dip', async ({ swap, duration = 1.0 }) => {
      if (!this.veil) { await swap(); return; }
      await tween(this.veil, { opacity: 1, duration: duration * 0.4, ease: 'power2.in' });
      await swap();
      await tween(this.veil, { opacity: 0, duration: duration * 0.6, ease: 'power2.out' });
    });
    let warned = false;
    this.register('matchCut', (ctx) => {
      if (!warned) { console.warn('[TransitionManager] matchCut — Phase 2, пока используется dip'); warned = true; }
      return this.registry.get('dip')(ctx);
    });
  }

  register(name, fn) { this.registry.set(name, fn); }

  run(name, ctx) {
    const fn = this.registry.get(name) ?? this.registry.get('dip');
    return fn({ app: this.app, ...ctx });
  }
}
