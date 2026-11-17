import { FEATURES, STATUS } from '../data/features.js';
import { DISCLAIMER } from '../config.js';

const $ = (id) => globalThis.document?.getElementById(id);

/** Весь DOM-слой поверх canvas: загрузчик, бейдж статуса функции, субтитры, отладка, ошибки. */
export class Hud {
  constructor() {
    this.el = {
      loader: $('loader'), bar: $('loader-bar'), text: $('loader-text'), start: $('start'),
      badge: $('badge'), badgeText: $('badge-text'), caption: $('caption'),
      disclaimer: $('disclaimer'), paused: $('paused'), debug: $('debug'), error: $('error'),
      notices: $('notices'), panel: $('panel'), bench: $('bench'),
    };
    this.el.disclaimer.textContent = DISCLAIMER;
  }

  setLoading(p, text) {
    this.el.bar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.text.textContent = text;
  }

  /** Показать кнопку «Начать»; нужен клик — иначе браузер не разрешит звук и полноэкранный режим. */
  showStart(onClick) {
    this.el.text.textContent = 'Готово';
    this.el.start.hidden = false;
    this.el.start.focus();
    this.el.start.onclick = () => { this.el.start.hidden = true; this.el.loader.classList.add('done'); onClick(); };
  }

  /** Бейдж статуса: что в кадре — реальная функция, ссылка на сервис или концепт. */
  setScene(scene) {
    this.setCaption('');
    this.el.panel.style.opacity = ''; this.el.panel.style.transform = ''; // панель прошлой сцены — в исходное (скрыто)
    const f = scene.feature && FEATURES[scene.feature];
    if (!f) { this.el.badge.hidden = true; return; }
    const st = STATUS[f.status];
    this.el.badge.hidden = false;
    this.el.badge.className = st.tone === 'warn' ? 'warn' : '';
    this.el.badgeText.textContent = `${f.title} — ${st.label}`;
    this.el.disclaimer.hidden = !scene.showDisclaimer;
  }

  setCaption(text) { this.el.caption.textContent = text ?? ''; }
  setPaused(p) { this.el.paused.hidden = !p; }
  setEnded() { this.setCaption('Конец'); this.el.disclaimer.hidden = false; }

  toggleDebug() { this.el.debug.hidden = !this.el.debug.hidden; return !this.el.debug.hidden; }
  get debugOn() { return !this.el.debug.hidden; }
  /** Троттлинг (4 раза в секунду) делает App: DOM-запись каждый кадр — лишняя нагрузка. */
  setDebug(text) { this.el.debug.textContent = text; }

  /** Уведомление поверх кадра (ошибка ассета, отключённый эффект…). warn исчезает через 12 с. */
  notice(text, tone = 'warn') {
    const d = document.createElement('div');
    d.className = `notice ${tone}`; d.textContent = text;
    this.el.notices.appendChild(d);
    if (tone !== 'error') setTimeout(() => d.remove(), 12000);
    while (this.el.notices.children.length > 4) this.el.notices.firstChild.remove();
  }

  /** Простая HTML-панель поверх сцены (проверка связки 3D + HTML). Элементом управляет таймлайн сцены. */
  setPanel({ title, items = [], tag = '' }) {
    const p = this.el.panel;
    p.replaceChildren();
    const h = document.createElement('h2'); h.textContent = title; p.appendChild(h);
    const ul = document.createElement('ul');
    for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
    p.appendChild(ul);
    if (tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; p.appendChild(t); }
    return p;
  }
  get panel() { return this.el.panel; }

  /** Отчёт режима ?bench — текст, который можно скопировать (клик по окну закрывает его). */
  showBench(r) {
    const o = r.overall, e = r.environment, g = r.growth, f = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
    const text = [
      `ЗАМЕР ${r.seconds} с · кадров ${o.frames} · холст ${e.canvas.join('×')}`, `GPU: ${e.gpu}`, r.verdict, '',
      `FPS средний ${f(o.avgFps)}  (первая треть ${f(r.fpsFirstThird)} → последняя ${f(r.fpsLastThird)})`,
      `FPS «1% low» ${f(o.low1Fps)}   минимум ${f(o.minFps)}`,
      `кадр p50 ${f(o.medianMs)} мс · p95 ${f(o.p95Ms)} · p99 ${f(o.p99Ms)} · макс ${f(o.maxMs)} · σ ${f(o.stdevMs)}`,
      `зависаний >250 мс: ${o.stalls250}; кадров >2× медианы: ${o.jankFrames}`,
      `draw calls (пик) ${r.peaks.drawCalls}   треугольники (пик) ${r.peaks.triangles}`,
      `рост за замер: геометрии ${g.geometries}, текстуры ${g.textures}, программы ${g.programs}, DOM ${g.domNodes}, куча JS ${f(g.heapMB)} МБ`,
      `pixelRatio ${f(e.pixelRatioStart, 2)} → ${f(e.pixelRatioEnd, 2)} · MSAA ${e.antialias ? 'вкл' : 'выкл'} · адаптация ${e.adaptiveQuality ? 'вкл' : 'выкл'}`,
      '', 'Сделайте скриншот этого окна и пришлите вместе с моделью видеокарты. Полный JSON — window.__bench в консоли.',
    ].join('\n');
    this.el.bench.textContent = text; this.el.bench.hidden = false;
    this.el.bench.onclick = () => { this.el.bench.hidden = true; };
  }

  showError(msg) { this.el.error.hidden = false; this.el.error.textContent = msg; }
}
