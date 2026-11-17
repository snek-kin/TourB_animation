# Реестр ассетов TourB Cinematic

> Генерируется командой `npm run assets:report` из `assets/assets.manifest.json`. Не правьте этот файл вручную — правьте манифест.

**Итого:** Available — 1 · Prepared — 4 · Placeholder — 0 · Missing — 24 (всего 29)

## effects

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `fx.matrix_rain` | Цифровой дождь вокруг камеры (сцена «Цифровой мир») | **Prepared** | src/effects/MatrixRain.js | Код проекта: Points + ShaderMaterial, глифы — canvas-атлас (цифры, символы, Ң Ө Ү) | Проверено в headless Chromium (SwiftShader); производительность на реальной GPU не измерена. |
| `fx.particle_morph` | Частицы собирают интерфейс/карточки/иконки; morphTo() для цепочки форм | **Prepared** | src/effects/ParticleMorph.js | Код проекта: Points + ShaderMaterial + samplePointsFromCanvas() | Формы берутся из любого canvas-рисунка (текст, иконка, контур). Проверено в headless Chromium (SwiftShader, программный рендер): шейдеры компилируются, кадры рендерятся; FPS на реальной GPU не измерен. |
| `fx.glow_marker` | Светящиеся маркеры мест и индикаторы локаций | **Prepared** | src/effects/GlowMarker.js | Код проекта: шейдеры луча и «ряби», общая геометрия | Проверено в headless Chromium (SwiftShader, программный рендер): шейдеры компилируются, кадры рендерятся; FPS на реальной GPU не измерен. |
| `fx.floating_card` | Плавающие информационные карточки; на концепт-карточках всегда бейдж статуса | **Prepared** | src/effects/FloatingCard.js | Код проекта: canvas-текстура на плоскости, billboard | Проверено в headless Chromium (SwiftShader, программный рендер): шейдеры компилируются, кадры рендерятся; FPS на реальной GPU не измерен. |
| `fx.digital_roads` | Дороги → светящиеся линии при превращении города в карту | **Missing** | — | План: Line2/TubeGeometry + шейдер бегущего импульса (Phase 3) |  |
| `fx.photo_bubbles` | Фото-«пузыри» над точками на карте (концепт «Живой город») | **Missing** | — | План: FloatingCard + реальные разрешённые фото; сейчас фото нет | Фото от путешественников — идея, не функция проекта; нужны права на изображения. |
| `fx.holo_ui` | Голографические элементы интерфейса поверх 3D | **Missing** | — | План: CSS3DRenderer или HTML-оверлей + 3D-панели (Phase 2–3) |  |

## models

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `env.terrain.kyrgyzstan` | Облёт гор в открывающей сцене и финале | **Missing** | models/environment/kyrgyz_terrain.glb | Создать: DEM Copernicus GLO-30 → меш с LOD → GLB + текстура (цвет по высоте/снегу) | бюджет: tris 300000, textureMax 2048, fileMB 12; лицензия: Copernicus WorldDEM-30: бесплатно, обязательная атрибуция (см. docs/04); Разрешение 30 м годится для облёта, но не для крупных планов гор — потребуется детализирующий шум/текстуры. |
| `env.bishkek.city` | Облёт Бишкека и превращение в цифровую карту | **Missing** | models/environment/bishkek_city.glb | Создать из контуров зданий OpenStreetMap (экструзия по этажности) или купить готовую модель | бюджет: tris 250000, textureMax 2048, fileMB 10; лицензия: OSM: ODbL (атрибуция © OpenStreetMap) — подтвердить на openstreetmap.org/copyright; платные модели — по их лицензии; Цены и условия не проверены — открыть карточки и «3D Content Licensing Agreement» перед покупкой. Google Photorealistic 3D Tiles НЕ подходят: политика Google запрещает кэширование и офлайн-использование. |
| `env.manas_airport` | Сцена прилёта: здание/перрон/выход | **Missing** | models/environment/manas_airport.glb | Создать стилизованно в Blender по фото; готовой проверенной модели не найдено | бюджет: tris 80000, textureMax 2048, fileMB 6; По исследованию (2026) терминал на реконструкции: не показывать банкоматы/Wi-Fi/«удобный выход» как факт — только условную стилизацию. |
| `env.ala_too_square` | Площадь Ала-Тоо: флагшток, музей, памятник Манасу | **Missing** | models/environment/ala_too_square.glb | Создать стилизованно по справочным фото/OSM; готовой бесплатной модели не найдено (поиск 16.11.2026) | бюджет: tris 60000, textureMax 2048, fileMB 5; Для памятников проверить правила использования изображений. |
| `env.son_kul` | Озеро Сон-Куль: плато, юрты | **Missing** | models/environment/son_kul.glb | Создать: DEM-фрагмент + плоскость воды (шейдер) + юрты из процедурной геометрии | бюджет: tris 150000, textureMax 2048, fileMB 8 |
| `env.ala_archa` | Ущелье Ала-Арча | **Missing** | models/environment/ala_archa.glb | Создать: DEM-фрагмент + деревья (инстансы) | бюджет: tris 150000, textureMax 2048, fileMB 8 |
| `env.roads_streets` | Дороги, перекрёстки, улицы | **Missing** | models/environment/roads_streets.glb | Кандидат: Kenney City Kit (Roads) — CC0 по описаниям на itch.io/Summer Engine; открыть страницу на kenney.nl и подтвердить | бюджет: tris 30000, textureMax 1024, fileMB 3 |
| `veh.airplane` | Пассажирский самолёт: облёт и посадка в Манас | **Missing** | models/vehicles/airliner.glb | Нужна low-poly модель пассажирского лайнера без узнаваемых логотипов авиакомпаний; искать на Poly Pizza (CC0/CC-BY, лицензия у каждой модели своя) | бюджет: tris 25000, textureMax 2048, fileMB 3; При CC-BY — записать атрибуцию в credits. Страница poly.pizza у части пользователей не открывается — лицензию КАЖДОЙ модели проверять вручную и сохранять скриншот страницы. |
| `veh.cars` | Такси, легковые и фургоны на улицах | **Missing** | models/vehicles/cars.glb | Кандидат: Kenney Car Kit — лицензия CC0, 45 файлов, версия 3.0 от 23.01.2026 (проверено 17.11.2026 на странице kenney.nl). Форматы файлов на странице НЕ указаны — после скачивания проверить, есть ли glTF/GLB; иначе конвертировать (например, из FBX/OBJ через Blender) | бюджет: tris 3000, textureMax 512, fileMB 1; Не скачано: у среды нет доступа к kenney.nl. Ранее в реестре было написано «есть glTF» — это не подтверждалось страницей, исправлено. |
| `veh.bus` | Автобус Бишкека; колесо — для перехода «кнопка конвертера → колесо автобуса» | **Missing** | models/vehicles/bus.glb | Проверить наличие автобуса в Kenney Car Kit; иначе Poly Pizza | бюджет: tris 8000, textureMax 1024, fileMB 1.5; Для match cut важно колесо отдельным узлом — проверить иерархию модели. |
| `chr.tourists` | Туристы и пешеходы (стилизованные) | **Missing** | models/characters/tourists.glb | Low-poly персонажи с Poly Pizza (проверять лицензию каждой модели) или собственные в Blender | бюджет: tris 8000, textureMax 1024, fileMB 2; Анимации ходьбы — отдельная задача; для скинированных моделей клонировать через SkeletonUtils. |
| `obj.smartphone` | Смартфон: камера «входит» в экран | **Missing** | — | Создать в коде (скруглённый бокс + плоскость экрана с canvas/HTML-текстурой интерфейса TourB) — Phase 2 | Своя геометрия точнее для перехода в экран; бренд телефона не показываем. |
| `obj.suitcase` | Чемоданы в аэропорту | **Missing** | models/objects/suitcase.glb | Кандидат: Poly Haven «vintage_suitcase» (CC0 — по сторонней ссылке, открыть страницу и подтвердить) либо Poly Pizza | бюджет: tris 8000, textureMax 1024, fileMB 2 |
| `obj.coins` | Монета → солнце над Бишкеком | **Missing** | — | Создать в коде: цилиндр + чеканка в normal map; без копирования реальных банкнот/монет Нацбанка КР | Проверить ограничения на воспроизведение национальных денежных знаков. |
| `obj.interiors` | Интерьеры жилья; окно здания для перехода «карточка → окно» | **Missing** | models/objects/guesthouse_interior.glb | Создать стилизованно / Poly Pizza | бюджет: tris 40000, textureMax 2048, fileMB 5 |
| `obj.market` | Магазины и рынок (Smart Deals — только как идея) | **Missing** | models/objects/bazaar.glb | Создать стилизованно; Smart Deals не показывать как готовую функцию | бюджет: tris 40000, textureMax 2048, fileMB 5 |

## textures

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `tex.ref.deck_mountain_lake` | Справочный кадр гор из презентации TourB (слайды 1 и 17) — настроение/палитра опенинга | **Available** | textures/ref/deck_mountain_lake.jpg | Извлечено из TourB_presentation_v2.pdf (1450×844, JPEG) | лицензия: ПРОИСХОЖДЕНИЕ НЕ ПОДТВЕРЖДЕНО — изображение выглядит сгенерированным; использовать только как референс, в финал — после подтверждения прав; Не подключено ни к одной сцене.; факт: 0.16 МБ |

## hdri

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `tex.sky.hdri` | Небо и освещение для реалистичных сцен | **Missing** | hdri/sky_day.hdr | Кандидат: Poly Haven HDRI (CC0 по их условиям — подтвердить на сайте); держать ≤ 2K для веба | бюджет: textureMax 2048, fileMB 6 |

## audio

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `aud.ambient.mountains` | Ветер/простор для опенинга и гор | **Missing** | audio/ambient/mountains.ogg | Лицензированная библиотека (проверить лицензию) или запись | бюджет: fileMB 3 |
| `aud.sfx.ui` | Звуки интерфейса, сборка частиц, «вход в телефон» | **Missing** | audio/sfx/ui_whoosh.ogg | Кандидаты: паки Kenney Audio (CC0 — подтвердить конкретный пак); либо синтез в Web Audio | бюджет: fileMB 1 |
| `aud.music.main` | Музыкальная дорожка 3:50 | **Missing** | audio/music/main_theme.ogg | Нужен трек с правами на публичное выступление; длительность 230 с | бюджет: fileMB 6; Первичное требование — подтверждённая лицензия. |

## ui

| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |
|---|---|---|---|---|---|
| `ui.logo` | Логотип TourB для финала и интерфейса | **Missing** | ui/tourb_logo.svg | Взять у дизайнеров команды (Алинур, Асема) в SVG |  |

## Источники (проверено при подготовке)

- `env.terrain.kyrgyzstan` — [Copernicus DEM GLO-30 (AWS Open Data)](https://registry.opendata.aws/copernicus-dem/) · проверено: 2026-11-16
- `env.terrain.kyrgyzstan` — [Лицензия Copernicus WorldDEM-30 (PDF)](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf) · проверено: 2026-11-16
- `env.bishkek.city` — [RenderHub · Bishkek Capital of Kyrgyzstan 3D Map (Heat 3D) — платная, Extended Use License, формат Blender, ~63 тыс. полигонов](https://www.renderhub.com/heat-3d/bishkek-capital-of-kyrgyzstan-3d-map) · проверено: 2026-11-16
- `env.bishkek.city` — [RenderHub · Bishkek City 3D Model 40km (3dstudio) — платная, Extended Use License](https://www.renderhub.com/3dstudio/bishkek-city-kyrgyzstan-3d-model-40km) · проверено: 2026-11-16
- `env.roads_streets` — [Kenney Assets (CC0)](https://kenney.nl/assets) · проверено: 2026-11-16
- `veh.airplane` — [Poly Pizza (CC0 и CC-BY 4.0, скачивание GLB)](https://poly.pizza) · проверено: 2026-11-16
- `veh.cars` — [Kenney · Car Kit (CC0, 45 файлов; форматы не указаны)](https://kenney.nl/assets/car-kit) · проверено: 2026-11-17
- `chr.tourists` — [Poly Pizza](https://poly.pizza) · проверено: 2026-11-16
- `obj.suitcase` — [Poly Haven · vintage_suitcase (не проверено напрямую)](https://polyhaven.com/a/vintage_suitcase) · проверено: не проверено

