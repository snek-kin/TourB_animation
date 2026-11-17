// Единая конфигурация проекта. Всё, что влияет на вид и производительность, — здесь.
export const CONFIG = {
  design: { width: 1920, height: 1080, aspect: 16 / 9 },
  totalDurationSec: 230, // 3:50 — сумма длительностей в data/timeline.js проверяется тестом

  quality: {
    maxPixelRatio: 2,     // потолок для retina-экранов
    minPixelRatio: 0.75,  // ниже адаптивное разрешение не опускается
    targetFps: 50,        // ниже — снижаем качество
    checkEverySec: 2,
    step: 0.85,           // множитель pixelRatio при снижении
    // Сначала дешёвое для глаза — плотность частиц/дождя, и только потом разрешение.
    densitySteps: [1, 0.75, 0.55, 0.4],
    // MSAA: на экранах с высокой плотностью пикселей (DPR ≥ 1.75) он почти не виден, но дорог
    antialiasMaxDpr: 1.75,
    maxDt: 0.1,           // потолок dt (с): после фоновой вкладки/подвисания время сцены не «прыгает»
  },

  // Палитра: цвета бренда из презентации TourB + один сдержанный «цифровой» зелёный.
  palette: {
    navy: 0x0a1e3c,
    blue: 0x2f7bf6,
    amber: 0xffb03b,
    teal: 0x17a589,
    digitalGreen: 0x35e08a,
    ice: 0xdbe9ff,
  },

  camera: { fov: 42, near: 0.1, far: 4000 },
  debug: new URLSearchParams(globalThis.location?.search ?? '').has('debug'),
};

// Дисклеймер из презентации TourB (слайд 1) — показываем в начале и в конце фильма.
export const DISCLAIMER =
  'Сцены и интерфейсы — концепт. Интеграции и партнёрства описаны как планы, соглашений пока нет.';
