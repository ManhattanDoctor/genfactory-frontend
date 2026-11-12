import type { ReactElement } from 'react';
import { useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthProvider';

const RECENT_COUNT = 5;

/** The same compact conversation list for both workspaces. */
export function ConversationNavigation({
  path,
  tag,
  label,
  children,
  onNavigate,
}: {
  path: '/chat' | '/agent';
  tag: 'content-studio' | 'chat';
  label: string;
  children: ReactNode;
  onNavigate?: () => void;
}): ReactElement {
  const { user } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [visible, setVisible] = useState(RECENT_COUNT);
  const dialogs = useInfiniteQuery({
    queryKey: ['conversations', user?.id, 'navigation', tag],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      api.conversations(user!.id, pageParam, signal, undefined, [tag], undefined, { isArchived: false }),
    getNextPageParam: (last) => (last.pageIndex + 1 < last.pages ? last.pageIndex + 1 : undefined),
  });
  const chats = [
    ...new Map(
      (dialogs.data?.pages.flatMap((page) => page.items) || [])
        .filter((c) => c.userId === user?.id && c.tags?.includes(tag) && !c.isArchived)
        .map((c) => [c.id, c] as const),
    ).values(),
  ];
  const hasMore = chats.length > visible || dialogs.hasNextPage;
  async function showMore(): Promise<void> {
    if (visible >= chats.length && dialogs.hasNextPage) await dialogs.fetchNextPage();
    setVisible((count) => count + RECENT_COUNT);
  }
  return (
    <div className="agent-nav-group">
      <div className="agent-nav-row">
        {children}
        {(chats.length > 0 || dialogs.hasNextPage) && (
          <button
            type="button"
            className="agent-nav-fold"
            aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} диалоги ${label}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          />
        )}
      </div>
      {expanded && chats.length > 0 && (
        <div className="agent-nav-projects" role="group" aria-label={`Диалоги ${label}`}>
          {chats.slice(0, visible).map((c) => (
            <Link
              key={c.id}
              className="agent-nav-project"
              aria-current={
                location.pathname === path &&
                new URLSearchParams(location.search).get('conversation') === String(c.id)
                  ? 'page'
                  : undefined
              }
              to={`${path}?conversation=${c.id}`}
              onClick={onNavigate}
              title={c.name}
            >
              <span>{c.name || 'Диалог'}</span>
            </Link>
          ))}
          {hasMore && (
            <button
              type="button"
              className="agent-nav-project"
              disabled={dialogs.isFetchingNextPage}
              onClick={() => void showMore()}
            >
              {dialogs.isFetchingNextPage ? 'Загрузка…' : 'Ещё диалоги'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
