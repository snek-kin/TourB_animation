export const DEMO_STORY = {
  id: 'cinematic-demo',
  title: 'История: демо-маршрут',
  launchLabel: 'Открыть демо-историю',
  hotspots: [
    {
      id: 'waypoint-a',
      position: [0, 0, 0],
      radiusPx: 34,
      label: 'Демо-точка A',
      content: {
        title: 'Демо-точка A',
        subtitle: 'Интерактивная точка',
        description: 'Вымышленный пример для демонстрации интерфейса — не описание реального места.',
        facts: ['Содержимое точки задаётся конфигурацией истории.'],
        statistics: [{ label: 'Показатель', value: 'Демо' }],
      },
    },
    {
      id: 'waypoint-b',
      position: [12, 0, 8],
      radiusPx: 34,
      label: 'Демо-точка B',
      content: {
        title: 'Демо-точка B',
        subtitle: 'Интерактивная точка',
        description: 'Вторая вымышленная точка показывает переход между главами.',
        facts: ['Реальные географические сведения не используются.'],
      },
    },
  ],
  chapters: [
    {
      id: 'approach',
      title: 'Глава 1 · Знакомство',
      steps: [
        {
          id: 'overview',
          title: 'Демо-маршрут',
          subtitle: 'Кинематографическое знакомство',
          description: 'Пример последовательности камеры, подсветки и информационной панели.',
          facts: ['Все точки и сведения здесь вымышлены.'],
          statistics: [{ label: 'Длина маршрута', value: 'Не задана' }],
          actions: [
            { type: 'focus', target: [0, 0, 0], offset: [0, 10, 22], duration: 1.2 },
            { type: 'highlight', target: 'waypoint-a' },
            { type: 'event', name: 'demo:chapter-entered', payload: { chapter: 'approach' } },
          ],
        },
        {
          id: 'choose-a',
          title: 'Выберите точку',
          subtitle: 'Шаг с ожиданием действия зрителя',
          description: 'Нажмите на подсвеченную демо-точку A, чтобы продолжить.',
          actions: [
            { type: 'focus', target: 'waypoint-a', offset: [0, 8, 14], duration: 0.8 },
            { type: 'interaction', hotspotId: 'waypoint-a', prompt: 'Нажмите на демо-точку A.' },
          ],
        },
      ],
    },
    {
      id: 'details',
      title: 'Глава 2 · Детали',
      steps: [
        {
          id: 'compare',
          title: 'Смена перспективы',
          subtitle: 'Данные истории отделены от движка',
          description: 'Этот шаг демонстрирует другой фокус камеры, факт и синхронизированное событие.',
          facts: ['Сюжетные сведения можно менять без изменения StorytellingEngine.'],
          statistics: [{ label: 'Глав', value: '2 · демо' }, { label: 'Точек', value: '2 · демо' }],
          actions: [
            { type: 'focus', target: 'waypoint-b', offset: [9, 7, 12], duration: 1 },
            { type: 'highlight', target: 'waypoint-b', color: 0xffb03b },
            { type: 'event', name: 'demo:waypoint-focused', payload: { waypoint: 'B' } },
          ],
        },
        {
          id: 'finish',
          title: 'Конец демо-истории',
          subtitle: 'Можно повторить или закрыть',
          description: 'Здесь история освобождает камеру и возвращает управление презентации.',
          actions: [
            { type: 'wait', duration: 0.15 },
            { type: 'panel', content: { facts: ['Ни одно утверждение о реальном Бишкеке не подразумевается.'] } },
          ],
        },
      ],
    },
  ],
};
