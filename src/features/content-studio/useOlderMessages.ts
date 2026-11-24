import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { studioMessagesQuery } from './useContentConversation';

export function useOlderMessages(userId: number, conversationId: number, pages: number) {
  const top = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ node: Element; top: number } | undefined>(undefined);
  const [count, setCount] = useState(0);
  const older = useQueries({
    queries: Array.from({ length: Math.min(count, Math.max(0, pages - 1)) }, (_, i) =>
      studioMessagesQuery(userId, conversationId, i + 1),
    ),
  });
  const last = older.at(-1);
  const loaded = older.filter((query) => query.data).length;
  useLayoutEffect(() => {
    const saved = anchor.current;
    const thread = top.current?.closest('.cw-thread');
    if (thread && saved?.node.isConnected)
      thread.scrollTop += saved.node.getBoundingClientRect().top - saved.top;
    anchor.current = undefined;
  }, [loaded]);
  useEffect(() => {
    const marker = top.current;
    const thread = marker?.closest('.cw-thread');
    if (!marker || !thread || count + 1 >= pages || (count && !last?.data)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const node =
          thread.querySelector('.cw-turn:has(.as-user)') ?? thread.querySelector('[data-thread-end]');
        if (node) anchor.current = { node, top: node.getBoundingClientRect().top };
        setCount(count + 1);
      },
      { root: thread },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [count, pages, last?.data]);
  useEffect(() => {
    const thread = top.current?.closest('.cw-thread');
    const update = () => {
      const saved = anchor.current;
      if (saved) saved.top = saved.node.getBoundingClientRect().top;
    };
    thread?.addEventListener('scroll', update);
    return () => thread?.removeEventListener('scroll', update);
  }, []);
  return {
    top,
    items: older.flatMap((query) => query.data?.items ?? []),
    failed: last?.isError ? last : undefined,
  };
}
