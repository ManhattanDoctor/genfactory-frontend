import { Image, MessageCircle, Video } from 'lucide-react';

// Shared by the home cards and navigation; editors keep their existing routes.
export const destinations = [
  {
    to: '/chat',
    label: 'Студия контента',
    CardIcon: MessageCircle,
    subtitle: 'Генерация в диалоге',
    description:
      'Собирайте кадры и ролики в переписке с ИИ: уточняйте задачу, просите правки по уже готовому результату и ведите работу шаг за шагом - без переписывания всего промпта с нуля.',
    audience: 'Командам и авторам, которым важны итерации, правки и контроль над черновиком.',
    action: 'Открыть студию',
    icon: 'mark-studio',
  },
  {
    to: '/image',
    label: 'Изображения',
    CardIcon: Image,
    subtitle: 'Моно-генерация',
    description:
      'Один точный промпт - сразу готовый кадр. Режим для тех, кто умеет формулировать задачу и хочет результат без длинного диалога.',
    audience: 'Профессионалам: дизайнерам, маркетологам и продакшену с сильным навыком промптов.',
    action: 'Собрать изображение',
    icon: 'mark-image',
  },
  {
    to: '/video',
    label: 'Видео',
    CardIcon: Video,
    subtitle: 'Моно-генерация',
    description:
      'Короткий ролик из одного сильного ТЗ. Тот же принцип, что у изображений: вы задаёте сцену, модель отдаёт готовый клип.',
    audience:
      'Профи, которые уже умеют ставить видео-промпт и хотят быстрый продакшен без студийного диалога.',
    action: 'Собрать видео',
    icon: 'mark-video',
  },
] as const;
