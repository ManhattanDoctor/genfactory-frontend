import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import './agent-navigation.css';
import { Link, useLocation } from 'react-router-dom';
import { destinations } from './destinations';
import { useAuth } from '../features/auth/AuthProvider';

export function AppNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(true);
  const dialogs = useInfiniteQuery({
    queryKey: ['conversations', user?.id, 'agent-navigation', 'chat'],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.conversations(user!.id, pageParam, signal, undefined, ['chat']),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
  });
  const chats =
    dialogs.data?.pages
      .flatMap((p) => p.items)
      .filter((c) => c.userId === user?.id && c.tags?.includes('chat')) || [];
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
      {primary.map(renderDestination)}
      {user && renderDestination({ to: '/library', label: 'Библиотека', icon: 'assets' })}
      {user && renderDestination({ to: '/history', label: 'История', icon: 'history' })}
      <p className="shell-nav-heading">Инструменты</p>
      {destinations.slice(3).map((item) =>
        item.to !== '/agent' ? (
          renderDestination(item)
        ) : (
          <div key={item.to} className="agent-nav-group">
            <div className="agent-nav-row">
              {renderDestination(item)}
              {(chats.length > 0 || dialogs.hasNextPage) && (
                <button
                  className="agent-nav-fold"
                  aria-label={expanded ? 'Свернуть диалоги' : 'Развернуть диалоги'}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                />
              )}
            </div>
            {expanded && (
              <div className="agent-nav-projects">
                {chats.map((c) => (
                  <Link
                    key={c.id}
                    className="agent-nav-project"
                    aria-current={
                      location.pathname === '/agent' &&
                      new URLSearchParams(location.search).get('conversation') === String(c.id)
                        ? 'page'
                        : undefined
                    }
                    to={`/agent?conversation=${c.id}`}
                    onClick={onNavigate}
                    title={c.name}
                  >
                    <span>{c.name}</span>
                  </Link>
                ))}
                {dialogs.hasNextPage && (
                  <button
                    className="agent-nav-project"
                    disabled={dialogs.isFetchingNextPage}
                    onClick={() => void dialogs.fetchNextPage()}
                  >
                    Ещё диалоги
                  </button>
                )}
              </div>
            )}
          </div>
        ),
      )}
    </nav>
  );
}
