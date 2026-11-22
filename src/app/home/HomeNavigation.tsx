import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ActiveJobs } from '../../components/ActiveJobs';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatBalance } from '../../lib/money';
import { icons } from './icons';

export const modes = [
  { icon: 'studio', to: '/chat', label: 'Студия контента', action: 'Создать в студии' },
  { icon: 'image', to: '/image', label: 'Изображения', action: 'Создать изображение' },
  { icon: 'video', to: '/video', label: 'Видео', action: 'Создать видео' },
] as const;

export function HomeShell({ children, title = 'Главная' }: { children: ReactNode; title?: string }) {
  const pathname = useLocation().pathname.replace(/\/$/, '') || '/';
  const auth = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gf-home-sidebar-collapsed') === '1');
  const [mobile, setMobile] = useState(() => matchMedia('(max-width:780px)').matches);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia('(max-width:780px)');
    const change = () => {
      setMobile(query.matches);
      setOpen(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  const toggle = (
    <button
      className="gf-sidebar-toggle"
      aria-expanded={mobile ? open : !collapsed}
      aria-label={
        mobile ? (open ? 'Закрыть меню' : 'Открыть меню') : collapsed ? 'Развернуть меню' : 'Свернуть меню'
      }
      onClick={() => {
        if (mobile) setOpen(!open);
        else {
          localStorage.setItem('gf-home-sidebar-collapsed', collapsed ? '0' : '1');
          setCollapsed(!collapsed);
        }
      }}
    >
      {icons.toggle}
    </button>
  );
  const nav = (icon: keyof typeof icons, to: string, label: string, meta?: ReactNode) => (
    <Link
      key={to}
      to={to}
      data-tooltip={label}
      aria-label={label}
      aria-current={to === pathname ? 'page' : undefined}
      className={'gf-nav-item' + (to === pathname ? ' gf-is-active' : '')}
    >
      <span className="gf-nav-icon">{icons[icon]}</span>
      <span className="gf-nav-label">{label}</span>
      {meta}
    </Link>
  );
  return (
    <div
      className="gf-home"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <a href="#main" className="skip-link">
        К содержимому
      </a>
      <div
        className={
          'gf-app' +
          (!mobile && collapsed ? ' gf-is-sidebar-collapsed' : '') +
          (open ? ' gf-is-sidebar-open' : '')
        }
      >
        <div className="gf-overlay" onClick={() => setOpen(false)} />
        <aside
          className="gf-sidebar"
          aria-label="Основное меню"
          aria-hidden={mobile && !open}
          inert={mobile && !open}
        >
          <div className="gf-sidebar-top">
            {(!mobile || open) && toggle}
            <span className="gf-sidebar-brand">GenFactory</span>
          </div>
          <nav className="gf-nav" aria-label="Основное меню">
            {nav('home', '/', 'Главная')}
            {modes.map((m) => nav(m.icon, m.to, m.label))}
            <div className="gf-nav-divider" />
            {nav('library', '/library', 'Библиотека')}
            {nav('history', '/artifacts', 'История')}
          </nav>
          <div className="gf-sidebar-foot">
            {auth.user ? (
              <ActiveJobs
                renderTrigger={(status, label, show) => (
                  <button className="gf-nav-item" aria-label={label} onClick={show}>
                    <span className="gf-nav-icon">{icons.jobs}</span>
                    <span className="gf-nav-label">Работы</span>
                    <span className="gf-nav-badge">{status}</span>
                  </button>
                )}
              />
            ) : (
              <button
                className="gf-nav-item"
                aria-label="Войти, чтобы посмотреть работы"
                disabled={auth.signingIn}
                onClick={() => void auth.signIn()}
              >
                <span className="gf-nav-icon">{icons.jobs}</span>
                <span className="gf-nav-label">Работы</span>
                <span className="gf-nav-badge">0</span>
              </button>
            )}
            {nav(
              'account',
              '/account',
              'Мой аккаунт',
              <span className="gf-account-meta">
                {auth.user
                  ? auth.error
                    ? '—'
                    : formatBalance(auth.balances.RUB ?? '0', 'RUB') + ' GF'
                  : 'Войти'}
              </span>,
            )}
            {nav('company', '/company', 'О компании')}
          </div>
        </aside>
        <div className="gf-main" aria-hidden={mobile && open} inert={mobile && open}>
          <div className="gf-mobile-bar">
            {mobile && !open && toggle}
            <span className="gf-mobile-title">{title}</span>
            {pathname === '/chat' && <span id="studio-mobile-actions" />}
          </div>
          <main id="main" className={pathname === '/' ? 'gf-main-scroll' : 'gf-section-main'}>
            {auth.signInError && (
              <p role="alert">
                {auth.signInError} <button onClick={() => void auth.signIn()}>Повторить вход</button>
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
