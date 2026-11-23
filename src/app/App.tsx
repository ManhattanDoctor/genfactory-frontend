import type { ReactElement } from 'react';
import { OpenConversation } from './OpenConversation';
import { AppUpdateNotice } from '../components/AppUpdateNotice';
import { lazy, Suspense, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeShell } from './home/HomeNavigation';
import './sections.css';
import { Home } from './Home';
import { Company } from './Company';
const ContentStudio = lazy(() =>
  import('../features/content-studio/ContentStudio').then((m) => ({ default: m.ContentStudio })),
);
const Studio = lazy(() => import('../features/studio/Studio').then((m) => ({ default: m.Studio })));
const PromptStudio = lazy(() =>
  import('../features/prompt/PromptStudio').then((m) => ({ default: m.PromptStudio })),
);
const TextStudio = lazy(() =>
  import('../features/workspace/TextStudio').then((m) => ({ default: m.TextStudio })),
);
const AudioStudio = lazy(() =>
  import('../features/audio/AudioStudio').then((m) => ({ default: m.AudioStudio })),
);
const Templates = lazy(() =>
  import('../features/workspace/Templates').then((m) => ({ default: m.Templates })),
);
const Brand = lazy(() => import('../features/workspace/Brand').then((m) => ({ default: m.Brand })));
const Library = lazy(() => import('../features/library/Library').then((m) => ({ default: m.Library })));
const Artifacts = lazy(() => import('../features/library/Artifacts').then((m) => ({ default: m.Artifacts })));
const HistoryPage = lazy(() => import('../features/studio/History').then((m) => ({ default: m.History })));
const Account = lazy(() => import('../features/account/Account').then((m) => ({ default: m.Account })));
import { useAuth } from '../features/auth/AuthProvider';
const AuthCallback = lazy(() =>
  import('../features/auth/AuthCallback').then((m) => ({ default: m.AuthCallback })),
);
export function App(): ReactElement {
  const auth = useAuth();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  const sections: Record<string, [string, ReactElement]> = {
    '/': ['Главная', <Home />],
    '/image': ['Изображения', <Studio key="image" kind="image" />],
    '/video': ['Видео', <Studio key="video" kind="video" />],
    '/chat': ['Студия контента', <ContentStudio key={auth.user?.id} />],
    '/artifacts': ['История', <Artifacts />],
    '/library': ['Библиотека', <Library />],
    '/account': ['Мой аккаунт', <Account />],
    '/company': ['О компании', <Company />],
  };
  const editors: Record<string, [string, ReactElement]> = {
    '/agent': ['Обсудить идею', <TextStudio mode="chat" />],
    '/prompt': ['Подготовить промпт', <PromptStudio />],
    '/script': ['Написать сценарий', <TextStudio mode="script" />],
    '/templates': ['Шаблоны', <Templates />],
    '/brand': ['Правила бренда', <Brand />],
    '/audio': ['Аудио', <AudioStudio />],
    '/history': ['Беседы', <HistoryPage />],
    '/open': ['Беседа', <OpenConversation />],
    '/auth/callback': ['Вход', <AuthCallback />],
  };
  const path = location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const section = sections[path];
  const [title, content] = section ||
    editors[path] || [
      'Страница не найдена',
      <div className="empty-state">
        <h1>Здесь пока нет кадра</h1>
        <p>Страница не найдена.</p>
        <Link className="button primary" to="/">
          Вернуться в студию
        </Link>
      </div>,
    ];
  return (
    <>
      <HomeShell title={title}>
        <Suspense
          fallback={
            <div role="status" className="empty-state">
              Загрузка…
            </div>
          }
        >
          {section ? (
            content
          ) : (
            <div className="studio-shell editor-section">
              <div className="route-view" key={path}>
                {content}
              </div>
            </div>
          )}
        </Suspense>
      </HomeShell>
      <AppUpdateNotice />
    </>
  );
}
