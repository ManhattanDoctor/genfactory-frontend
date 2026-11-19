import type { ReactElement } from 'react';
import { Building2 } from 'lucide-react';
import { ConversationNavigation } from './ConversationNavigation';
import './agent-navigation.css';
import { Link, useLocation } from 'react-router-dom';
import { destinations } from './destinations';
import { useAuth } from '../features/auth/AuthProvider';

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }): ReactElement {
  const location = useLocation();
  const { user } = useAuth();
  const studio = new URLSearchParams(location.search).get('studio');
  const primary = [{ to: '/', label: 'Главная', icon: 'home' }, ...destinations];
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
        {item.icon === 'company' ? (
          <Building2 size={18} aria-hidden="true" />
        ) : (
          <img
            src={
              item.icon === 'history'
                ? '/media/nav/history.svg'
                : `/media/prototype/nav/${({ 'mark-studio': 'studio', 'mark-image': 'image', 'mark-video': 'video', prompt: 'edit' } as Record<string, string>)[item.icon] || item.icon}.webp`
            }
            alt=""
            width={18}
            height={18}
          />
        )}
        <span>{item.label}</span>
      </Link>
    );
  };
  return (
    <nav className="shell-navigation" aria-label="Основное меню">
      {primary.map((item) =>
        item.to === '/chat' ? (
          <ConversationNavigation
            key={`${user?.id}:studio`}
            path="/chat"
            tag="content-studio"
            label="Студии контента"
            onNavigate={onNavigate}
          >
            {renderDestination(item)}
          </ConversationNavigation>
        ) : (
          renderDestination(item)
        ),
      )}
      {user && renderDestination({ to: '/artifacts', label: 'История', icon: 'history' })}
      {user && renderDestination({ to: '/library', label: 'Библиотека', icon: 'assets' })}
      {onNavigate && renderDestination({ to: '/company', label: 'О компании', icon: 'company' })}
    </nav>
  );
}
