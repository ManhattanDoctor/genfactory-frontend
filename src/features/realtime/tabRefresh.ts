/** Reconcile after a long absence, or immediately when socket events are unavailable. */
export function observeTabReturn(refresh: () => void, isConnected: () => boolean): () => void {
  let hiddenAt: number | undefined = document.hidden ? Date.now() : undefined;
  const visibility = (): void => {
    if (document.hidden) {
      hiddenAt ??= Date.now();
      return;
    }
    const elapsed = hiddenAt === undefined ? 0 : Date.now() - hiddenAt;
    hiddenAt = undefined;
    if (navigator.onLine && (!isConnected() || elapsed >= 60_000)) refresh();
  };
  document.addEventListener('visibilitychange', visibility);
  return () => document.removeEventListener('visibilitychange', visibility);
}
