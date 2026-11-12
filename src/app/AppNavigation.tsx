import type { ReactElement } from 'react';
import { useState } from 'react';
import { ConversationNavigation } from './ConversationNavigation';
import './agent-navigation.css';
import { Link, useLocation } from 'react-router-dom';
import { destinations } from './destinations';
import { useAuth } from '../features/auth/AuthProvider';

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }): ReactElement {
  const location = useLocation();
  const { user } = useAuth();
  const [toolsOpen, setToolsOpen] = useState(false);
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
          src={
            item.icon === 'history'
              ? '/media/nav/history.svg'
              : `/media/prototype/nav/${({ 'mark-studio': 'studio', 'mark-image': 'image', 'mark-video': 'video', prompt: 'edit' } as Record<string, string>)[item.icon] || item.icon}.webp`
          }
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
      <button
        type="button"
        className="shell-tools-toggle"
        aria-label="Дополнительные инструменты"
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen(!toolsOpen)}
      >
        <span>Инструменты</span>
        <span aria-hidden="true">{toolsOpen ? '−' : '+'}</span>
      </button>
      {toolsOpen && (
        <div className="shell-tools">
          {destinations.slice(3).map((item) =>
            item.to !== '/agent' ? (
              renderDestination(item)
            ) : (
              <ConversationNavigation
                key={`${user?.id}:agent`}
                path="/agent"
                tag="chat"
                label="AI agent"
                onNavigate={onNavigate}
              >
                {renderDestination(item)}
              </ConversationNavigation>
            ),
          )}
        </div>
      )}
      {onNavigate && renderDestination({ to: '/company', label: 'О компании', icon: 'company' })}
    </nav>
  );
}
