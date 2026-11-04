import { Link, useLocation } from 'react-router-dom';
import { destinations } from './destinations';
import { useAuth } from '../features/auth/AuthProvider';

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuth();
  const studio = new URLSearchParams(location.search).get('studio');
  const primary = [{ to: '/', label: 'Главная', icon: 'home' }, ...destinations.slice(0, 3)];
  const renderDestination = (item: { to: string; label: string; icon: string }) => {
    const [path, query] = item.to.split('?');
    const active = location.pathname === path && studio === new URLSearchParams(query).get('studio');
    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={`shell-nav-item ${active ? 'active' : ''}`}
      >
        <img
          src={`/media/prototype/nav/${({ 'mark-studio': 'studio', 'mark-image': 'image', 'mark-video': 'video', prompt: 'edit' } as Record<string, string>)[item.icon] || item.icon}.webp`}
          alt=""
          width={18}
          height={18}
        />
        <span>{item.label}</span>
      </Link>
    );
  };
  return (
    <nav className="shell-navigation" aria-label="Основное меню">
      {primary.map(renderDestination)}
      {user && renderDestination({ to: '/history', label: 'История', icon: 'assets' })}
      <p className="shell-nav-heading">Инструменты</p>
      {destinations.slice(3).map(renderDestination)}
    </nav>
  );
}
