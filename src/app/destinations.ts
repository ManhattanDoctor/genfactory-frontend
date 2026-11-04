// Shared by the home cards and navigation; editors keep their existing routes.
export const destinations = [
  {
    to: '/chat',
    label: 'Студия контента',
    description: 'Обсудите задачу и подготовьте следующий кадр',
    icon: 'mark-studio',
    cover: 'studio-banner',
  },
  {
    to: '/image',
    label: 'Изображения',
    description: 'Создание и редактирование изображений',
    icon: 'mark-image',
    cover: 'images-banner',
  },
  {
    to: '/video',
    label: 'Видео',
    description: 'Ролики по описанию и исходному кадру',
    icon: 'mark-video',
    cover: 'video-banner',
  },
  {
    to: '/image?studio=banana',
    label: 'Nano Banana',
    description: 'Правка уже готового кадра',
    icon: 'banana',
  },
  {
    to: '/video?studio=seedance',
    label: 'Seedance Studio',
    description: 'Ролики в характере Seedance',
    icon: 'seedance',
  },
  { to: '/prompt', label: 'Generate Prompt', description: 'Слова, которые модель поймёт', icon: 'prompt' },
  { to: '/agent', label: 'AI agent', description: 'Спросить по задаче', icon: 'agent' },
] as const;
