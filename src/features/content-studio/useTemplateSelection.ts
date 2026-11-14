import { useEffect, useRef } from 'react';
import { loadTemplate } from './templateCatalog';
import type { ITemplate, ITemplateCard } from './materials';

/** Ignore a late module response after editing, navigation, sign-out or another selection. */
export function useTemplateSelection(
  scope: readonly unknown[],
): (card: ITemplateCard) => Promise<ITemplate | undefined> {
  const latest = useRef(scope);
  latest.current = scope;
  const request = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return async (card) => {
    const id = ++request.current;
    const isCurrent = () =>
      alive.current &&
      id === request.current &&
      scope.every((value, index) => value === latest.current[index]);
    try {
      const item = await loadTemplate(card);
      return isCurrent() ? item : undefined;
    } catch (error) {
      if (isCurrent()) throw error;
    }
  };
}
