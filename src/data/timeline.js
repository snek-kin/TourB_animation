// Черновая раскадровка на 3:50 (230 с). Сумма проверяется тестом (npm test).
// status: 'planned' — сцены ещё нет; 'implemented' — модуль есть в src/scenes/.
// transitionOut — черновая идея перехода в следующую сцену (match cut), см. docs/03-effects-plan.md.

export const TIMELINE = [
  { id: 'opening',    title: 'Облёт Кыргызстана',               duration: 25, features: [],
    transitionOut: 'облако → иллюминатор самолёта', status: 'planned' },
  { id: 'airport',    title: 'Манас: прилёт, смартфон',         duration: 25, features: ['first_24h'],
    transitionOut: 'камера входит в экран смартфона', status: 'planned' },
  { id: 'digital',    title: 'Цифровой мир: частицы → интерфейс', duration: 20, features: [],
    transitionOut: 'частицы интерфейса → огни города', status: 'implemented' },
  { id: 'bishkek',    title: 'Бишкек: места и карта',           duration: 25, features: ['maps_places'],
    transitionOut: 'карточка жилья → окно реального здания', status: 'implemented' },
  { id: 'stay',       title: 'Жильё и гиды',                    duration: 20, features: ['accommodation_guides'],
    transitionOut: 'круглая кнопка конвертера → колесо автобуса', status: 'planned' },
  { id: 'money',      title: 'Деньги и курсы',                  duration: 20, features: ['money_exchange'],
    transitionOut: 'монета → солнце над Бишкеком', status: 'planned' },
  { id: 'comms',      title: 'Язык и ИИ (будущее)',             duration: 20, features: ['ai_assistant', 'translator_dictionary'],
    transitionOut: 'переведённый текст → уличная табличка', status: 'planned' },
  { id: 'living',     title: 'Живой город (концепт)',           duration: 25, features: ['living_city', 'events_map'],
    transitionOut: 'маркер на карте → горная вершина', status: 'planned' },
  { id: 'mountains',  title: 'Горы и интерактивная карта',      duration: 25, features: ['interactive_map'],
    transitionOut: 'вершина → карточки функций', status: 'planned' },
  { id: 'extras',     title: 'Транспорт · 112 · Избранное',     duration: 15, features: ['public_transport', 'emergency', 'favorites', 'offline'],
    transitionOut: 'карточки → единая сеть', status: 'planned' },
  { id: 'finale',     title: 'Кыргызстан как одна экосистема',  duration: 10, features: [],
    transitionOut: null, status: 'planned' },
];

export const totalDuration = (list = TIMELINE) => list.reduce((s, x) => s + x.duration, 0);
