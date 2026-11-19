import { LANDMARK_LOCATIONS } from '../scenes/bishkek/landmarks/locations.js';

const manasHotspotPosition = {
  x: LANDMARK_LOCATIONS.manasMonument.x + 2.8,
  z: LANDMARK_LOCATIONS.manasMonument.z,
};
const manasFocusTarget = [
  LANDMARK_LOCATIONS.manasMonument.x + 1.6,
  2.4,
  LANDMARK_LOCATIONS.manasMonument.z,
];

function hotspot(id, title, subtitle, description, xz, facts) {
  return {
    id,
    position: [xz.x, 0, xz.z],
    radiusPx: 38,
    label: title,
    content: {
      title,
      subtitle,
      description,
      facts: [...facts, 'Процедурная художественная интерпретация, не точная геодезическая модель.'],
      statistics: [{ label: 'Привязка', value: 'Существующая карта проекта' }],
    },
  };
}

export const BISHKEK_LANDMARK_STORY = {
  id: 'bishkek-landmarks',
  title: 'Ориентиры Бишкека',
  launchLabel: 'Открыть историю ориентиров',
  hotspots: [
    hotspot(
      'ala-too-square',
      'Площадь Ала-Тоо',
      'Главное общественное пространство',
      'Прогулка по процедурно смоделированной площади с мощением и центральным флагштоком.',
      LANDMARK_LOCATIONS.alaTooSquare,
      ['Масштаб и положение взяты из резервной области существующей карты проекта.'],
    ),
    hotspot(
      'philharmonic',
      'Национальная филармония',
      'Колонный фасад и парадная лестница',
      'Стилизованный объём здания собран из повторяющихся колонн, окон и карнизов.',
      LANDMARK_LOCATIONS.philharmonic,
      ['Архитектура показана как художественная интерпретация, а не точная копия фасада.'],
    ),
    hotspot(
      'manas-monument',
      'Памятник Манасу',
      'Скульптурная композиция',
      'Бронзовая всадническая композиция собрана из процедурных деталей и ярусного постамента.',
      manasHotspotPosition,
      ['Положение использует существующую локальную привязку модели в проекте.'],
    ),
  ],
  chapters: [
    {
      id: 'central-square',
      title: 'Центр города · 1/2',
      steps: [
        {
          id: 'ala-too',
          title: 'Площадь Ала-Тоо',
          subtitle: 'Аэрофокус на площади',
          description: 'Кликните по подсвеченной точке, чтобы увидеть данные ориентира.',
          actions: [
            { type: 'focus', target: 'ala-too-square', offset: [0, 18, 30], duration: 1.5 },
            { type: 'highlight', target: 'ala-too-square', color: 0xffd36f },
            { type: 'interaction', hotspotId: 'ala-too-square', prompt: 'Нажмите на площадь Ала-Тоо.' },
          ],
        },
        {
          id: 'philharmonic',
          title: 'Национальная филармония',
          subtitle: 'Плавное снижение к колонному фасаду',
          description: 'Выберите точку у здания, чтобы открыть его описание.',
          actions: [
            { type: 'focus', target: 'philharmonic', offset: [0, 11, 19], duration: 1.7 },
            { type: 'highlight', target: 'philharmonic', color: 0x84dcff },
            { type: 'interaction', hotspotId: 'philharmonic', prompt: 'Нажмите на филармонию.' },
          ],
        },
      ],
    },
    {
      id: 'monument-and-horizon',
      title: 'Монумент и горный горизонт · 2/2',
      steps: [
        {
          id: 'manas',
          title: 'Памятник Манасу',
          subtitle: 'Крупный план скульптуры',
          description: 'Стилизованная бронзовая композиция с всадником и постаментом.',
          actions: [
            { type: 'focus', target: manasFocusTarget, offset: [12, 7, 5], duration: 1.45 },
            { type: 'highlight', target: 'manas-monument', color: 0xffb05a },
            { type: 'interaction', hotspotId: 'manas-monument', prompt: 'Нажмите на памятник Манасу.' },
          ],
        },
        {
          id: 'mountain-horizon',
          title: 'Город у подножия гор',
          subtitle: 'Широкий финальный план',
          description: 'Камера раскрывает городской рельеф и южный горный горизонт.',
          facts: ['Форма рельефа и архитектура показаны стилизованно.'],
          actions: [
            {
              type: 'camera',
              pose: { position: [0, 155, 115], target: [0, 150, 660], fov: 47 },
              duration: 2.2,
              ease: 'sine.inOut',
            },
            { type: 'event', name: 'bishkek:landmark-story-complete' },
          ],
        },
      ],
    },
  ],
};
