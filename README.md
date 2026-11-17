# TourB Cinematic — Phase 1 (фундамент)

Кинематографичная презентация TourB на Three.js + GSAP. **Это подготовительная фаза:** здесь архитектура,
тестовый стенд цифровых эффектов, реестр ассетов и техплан. Сцен фильма (облёт, аэропорт, Бишкек…) ещё нет.

## Как запустить в VS Code

1. Распакуйте архив и откройте папку `tourb-cinematic` в VS Code (**File → Open Folder**).
2. Установите расширение **Live Server** (Ritwick Dey).
3. ПКМ по `index.html` → **Open with Live Server**. Откройте в **Chrome или Edge**.
4. Дождитесь загрузки и нажмите **«Начать»**.

> Не открывайте `index.html` двойным кликом (`file://`): браузер блокирует ES-модули и загрузку манифеста.
> Альтернатива без расширения: в терминале VS Code `npm run serve` → http://localhost:5173
> (нужен Node.js). `npm install` для запуска **не нужен** — three и gsap уже лежат в `vendor/`;
> он нужен только для `npm test` и `npm run vendor`.

## Что вы увидите

Две технические сцены-стенда (не сцены фильма): **val-digital** (12 с: цифровой дождь, частицы собирают карточку «TourB» и булавку) →
плавный переход → **val-map** (14 с: маркеры, плавающие карточки, HTML-панель поверх 3D) → переход → снова в начало.
Камера летит по рельсе. Все карточки несут бейдж «Концепт» — это намеренно (см. `docs/01-analysis.md`).

Клавиши: **Пробел** — пауза · **← →** — предыдущая/следующая сцена · **D** — отладка (FPS, draw calls, память) · **F** — полный экран · **M** — звук.

Параметры адреса: `?debug` (панель отладки) · `?scene=sandbox` (старый стенд «всё в одном») · `?noadapt` · `?pr=1` · `?aa=0|1` · `?q=N` (уровень качества)
· **`?bench`** (замер 60 с на вашем железе) или `?bench=30`.

### Замер FPS на вашем компьютере (2 минуты)
Chrome или Edge **с аппаратным ускорением** → `…/index.html?bench` → через ~62 с появится окно с результатом (клик закрывает его).
Если в окне написано «программный рендер» — ускорение выключено, замер недействителен. Пришлите скриншот окна и модель видеокарты.

## Структура

```
index.html            точка входа (import map → vendor/)
src/main.js           старт, регистрация сцен
src/config.js         палитра, качество, камера, дисклеймер
src/core/             App, SceneManager, BaseScene, CameraController, AssetManager, TransitionManager,
                      AudioManager, Disposer, PerfMonitor, Warmup, ShaderGuard, Bench
src/effects/          MatrixRain, ParticleMorph, GlowMarker, FloatingCard, util
src/scenes/           ValidationDigitalScene, ValidationMapScene, SandboxScene (стенды); shared/Environment.js; сюда добавляются сцены фильма
src/data/             timeline.js (раскадровка 3:50), features.js (что реально есть в продукте)
src/ui/               Hud.js, style.css
assets/               models/ textures/ hdri/ audio/ ui/ effects/ + manifest, реестр, CREDITS
docs/                 анализ, архитектура, план эффектов, визуальные правила и риски
tools/ tests/         скрипты и тесты
vendor/               three r187, gsap 3.15, Draco-декодер (локально, без CDN)
```

Документация: `docs/01-analysis.md` → `02-architecture.md` → `03-effects-plan.md` → `04-visual-guidelines-risks-next.md` → **`05-phase1.5-stabilization.md`** (аудит, замеры до/после, ограничения).

## Что проверено, а что нет

Проверено (Chromium, **программный рендер SwiftShader, 1 ядро CPU**): `npm test` — 19 из 19; `audit.py` — 26 из 26 (старт без ошибок и 404, ассеты и запасное
поведение, компиляция шейдеров и защита от сбоя, камера, GSAP-переходы, 10 циклов без роста ресурсов, полнота `dispose`, потеря и восстановление контекста).
На одинаковых условиях средний FPS стенда вырос с 8.1 до 25.3 (адаптация выкл) — подробности и ограничения в `docs/05-phase1.5-stabilization.md`.
**Не проверено:** реальный FPS на видеокарте (только `?bench`), настоящие драйверы GPU, звук, Safari/Firefox.
