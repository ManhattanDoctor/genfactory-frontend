import { OpenConversation } from './OpenConversation';
import { AppUpdateNotice } from '../components/AppUpdateNotice';
import { ActiveJobs } from '../components/ActiveJobs';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { AppNavigation } from './AppNavigation';
import { Modal } from '../components/Modal';
import { formatBalance } from '../lib/money';
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
const HistoryPage = lazy(() => import('../features/studio/History').then((m) => ({ default: m.History })));
const Account = lazy(() => import('../features/account/Account').then((m) => ({ default: m.Account })));
import { useAuth } from '../features/auth/AuthProvider';
const AuthCallback = lazy(() =>
  import('../features/auth/AuthCallback').then((m) => ({ default: m.AuthCallback })),
);
export function App() {
  const auth = useAuth();
  const client = useQueryClient();
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileNav(false);
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const finish = () => {
      void client.invalidateQueries({ queryKey: ['account'] });
      void client.invalidateQueries({ queryKey: ['files'] });
    };
    window.addEventListener('genfactory:generation-finished', finish);
    return () => window.removeEventListener('genfactory:generation-finished', finish);
  }, [client]);
  return (
    <div translate="no" className={`app studio-shell ${collapsed ? 'nav-collapsed' : ''}`}>
      <a href="#main" className="skip-link">
        К содержимому
      </a>
      <header className="shell-mobile-header">
        <button
          className="icon-button"
          onClick={() => setMobileNav(true)}
          aria-label="Открыть меню"
          aria-expanded={mobileNav}
        >
          <Menu size={22} />
        </button>
        <Link to="/" className="brand" aria-label="Genfactory — главная">
          GENFACTORY
        </Link>
      </header>
      <aside className="shell-sidebar" aria-label="Навигация студии">
        <button
          className="icon-button shell-collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
        <AppNavigation />
        <div className="shell-account" aria-label="Аккаунт и работы">
          {auth.user ? (
            <>
              <ActiveJobs />
              <Link to="/account" className="shell-account-link" aria-label="Открыть аккаунт">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="3.25" />
                  <path d="M5.2 19.4a6.8 6.8 0 0 1 13.6 0" />
                </svg>
                <span>
                  <b>Мой аккаунт</b>
                  <small>
                    {auth.balances.RUB === undefined
                      ? 'Баланс недоступен'
                      : `${formatBalance(auth.balances.RUB, 'RUB')} ₽`}
                  </small>
                </span>
              </Link>
            </>
          ) : (
            <button
              className="shell-account-link"
              aria-label="Войти в аккаунт"
              aria-busy={auth.loading || auth.signingIn}
              disabled={auth.signingIn}
              onClick={() => void auth.signIn()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="3.25" />
                <path d="M5.2 19.4a6.8 6.8 0 0 1 13.6 0" />
              </svg>
              <span>Войти</span>
            </button>
          )}
          <Link to="/company" className="shell-account-link shell-company-link" title="О компании">
            <img src="/media/prototype/nav/company.webp" alt="" width={18} height={18} />
            <span>О компании</span>
          </Link>
        </div>
      </aside>
      {mobileNav && (
        <Modal title="Меню" className="mobile-navigation-modal" onClose={() => setMobileNav(false)}>
          <AppNavigation onNavigate={() => setMobileNav(false)} />
        </Modal>
      )}
      <main id="main" className="main">
        {auth.signInError && (
          <p className="page-content error" role="alert">
            {auth.signInError}
          </p>
        )}
        <div className="route-view" key={location.pathname}>
          <Suspense
            fallback={
              <div className="empty-state" role="status">
                <span className="spinner" /> Открываем студию…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/company" element={<Company />} />
              <Route path="/chat" element={<ContentStudio key={auth.user?.id} />} />
              <Route path="/agent" element={<TextStudio mode="chat" />} />
              <Route path="/prompt" element={<PromptStudio />} />
              <Route path="/script" element={<TextStudio mode="script" />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/brand" element={<Brand />} />
              <Route path="/image" element={<Studio kind="image" />} />
              <Route path="/video" element={<Studio kind="video" />} />
              <Route path="/audio" element={<AudioStudio />} />
              <Route path="/library" element={<Library />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/open" element={<OpenConversation />} />
              <Route path="/account" element={<Account />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>Здесь пока нет кадра</h1>
                    <p>Страница не найдена.</p>
                    <Link className="button primary" to="/">
                      Вернуться в студию
                    </Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </main>
      <AppUpdateNotice />
    </div>
  );
}
