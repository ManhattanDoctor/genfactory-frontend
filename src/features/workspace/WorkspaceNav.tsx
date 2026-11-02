import type { GnosisFile } from '../../lib/types';
import { NavLink } from 'react-router-dom';
export function WorkspaceNav({
  conversationId,
  media = true,
  draft,
}: {
  conversationId?: number;
  media?: boolean;
  draft?: { prompt: string; references: GnosisFile[]; userId?: number };
}) {
  return (
    <nav className="workspace-modes" aria-label="Режим работы">
      {(
        [
          ['chat', 'Обсудить'],
          ['prompt', 'Подготовить промпт'],
          ['script', 'Сценарий'],
          ['image', 'Изображение'],
          ['video', 'Видео'],
        ] as const
      ).map(([mode, label]) => (
        <NavLink
          key={mode}
          state={draft}
          to={`/${mode}${conversationId && (media || !['image', 'video'].includes(mode)) ? `?conversation=${conversationId}` : ''}`}
          className={({ isActive }) => `chip ${isActive ? 'active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
