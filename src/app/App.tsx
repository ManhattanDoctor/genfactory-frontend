import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  ImagePlus,
  Clapperboard,
  FolderOpen,
  History,
  ArrowUpRight,
  Menu,
  X,
  ChevronDown,
  Sparkles,
  PanelLeftClose,
  UserRound,
} from 'lucide-react';
import { formatBalance } from '../lib/money';
import { Home } from './Home';
const Studio = lazy(() => import('../features/studio/Studio').then((m) => ({ default: m.Studio })));
const Library = lazy(() => import('../features/library/Library').then((m) => ({ default: m.Library })));
const HistoryPage = lazy(() => import('../features/studio/History').then((m) => ({ default: m.History })));
const Account = lazy(() => import('../features/account/Account').then((m) => ({ default: m.Account })));
import { useAuth } from '../features/auth/AuthProvider';
const AuthCallback = lazy(() =>
  import('../features/auth/AuthCallback').then((m) => ({ default: m.AuthCallback })),
);
import { LoginDialog } from '../components/LoginDialog';
const navigation = [
  { to: '/', label: 'Обзор', Icon: Compass },
  { to: '/image', label: 'Изображения', Icon: ImagePlus },
  { to: '/video', label: 'Видео', Icon: Clapperboard },
  { to: '/library', label: 'Библиотека', Icon: FolderOpen },
  { to: '/history', label: 'История', Icon: History },
];
export function App() {
  const auth = useAuth();
  const client = useQueryClient();
  const [login, setLogin] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileNav(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const finish = () => {
      void client.invalidateQueries({ queryKey: ['account'] });
      void client.invalidateQueries({ queryKey: ['files'] });
    };
    window.addEventListener('genfactory:generation-finished', finish);
    return () => window.removeEventListener('genfactory:generation-finished', finish);
  }, [client]);
  return (
    <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
      <a href="#main" className="skip-link">
        К содержимому
      </a>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Открыть меню"
          aria-expanded={mobileNav}
        >
          <Menu size={22} />
        </button>
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          <span>
            GENFACTORY<span className="brand-dot">®</span>
          </span>
        </Link>
        <div className="topbar-divider" />
        <span className="workspace-label">
          Творческая студия <ChevronDown size={13} />
        </span>
        <div className="topbar-right">
          {auth.loading ? (
            <span className="small muted">Подключаем аккаунт…</span>
          ) : auth.user ? (
            <>
              <Link to="/account" className="balance-pill">
                <span className="live-dot" />
                {formatBalance(auth.balances.RUB, 'RUB')} ₽
              </Link>
              <Link to="/account" className="avatar" aria-label="Открыть аккаунт">
                {auth.user.preferences?.name?.slice(0, 1).toUpperCase() || <UserRound size={18} />}
              </Link>
            </>
          ) : (
            <button className="button primary top-login" onClick={() => setLogin(true)}>
              Начать создавать <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      </header>
      {mobileNav && (
        <button className="nav-scrim" aria-label="Закрыть меню" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-label">
          WORKSPACE
          <button
            className="icon-button close-mobile"
            onClick={() => setMobileNav(false)}
            aria-label="Закрыть меню"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Основное меню">
          {navigation.map(({ to, label, Icon }, i) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''} ${i === 3 ? 'nav-separated' : ''}`
              }
              title={label}
              aria-label={label}
            >
              <Icon size={19} strokeWidth={1.6} />
              <span>{label}</span>
              {to === '/video' && (
                <span className="nav-badge" aria-hidden="true">
                  AI
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={22} />
            <b>
              От идеи до
              <br />
              вашего кадра.
            </b>
            <p>
              Всё для следующего
              <br />
              творческого шага.
            </p>
            <Link to="/image">
              Создать <ArrowUpRight size={15} />
            </Link>
          </div>
          <button
            className="collapse-nav"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <PanelLeftClose size={18} />
            <span>Свернуть меню</span>
          </button>
          <span className="sidebar-copyright">© Genfactory · 2026</span>
        </div>
      </aside>
      <main id="main" className="main">
        {auth.error && (
          <div className="connection-banner" role="alert">
            Не удалось подключить аккаунт.{' '}
            <button className="text-button" onClick={auth.refresh}>
              Повторить
            </button>
          </div>
        )}
        <Suspense
          fallback={
            <div className="empty-state" role="status">
              <span className="spinner" /> Открываем студию…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/image" element={<Studio kind="image" />} />
            <Route path="/video" element={<Studio kind="video" />} />
            <Route path="/library" element={<Library />} />
            <Route path="/history" element={<HistoryPage />} />
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
      </main>
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
