declare const __APP_BUILD_ID__: string;
export const WORKER_PATH = '/genfactory-sw.js';
export function canUseUpdateWorker(production: boolean, location: Pick<Location, 'hostname' | 'protocol'>) {
  const host = location.hostname.toLowerCase();
  return (
    production &&
    location.protocol === 'https:' &&
    host !== 'localhost' &&
    !host.endsWith('.localhost') &&
    !/^127\./.test(host) &&
    !['[::1]', '::1', '0.0.0.0'].includes(host)
  );
}
export function watchAppUpdate(onAvailable: () => void, onReload: () => void) {
  let registration: ServiceWorkerRegistration | undefined;
  let stopped = false;
  let requested = false;
  const controllerChanged = () => {
    if (requested) {
      requested = false;
      onReload();
    } else navigator.serviceWorker.controller?.postMessage({ type: 'GENFACTORY_VERSION' });
  };
  const version = (event: MessageEvent) => {
    if (event.data?.type === 'GENFACTORY_VERSION' && event.data.version !== __APP_BUILD_ID__) onAvailable();
  };
  const check = () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    void registration?.update().catch(() => {});
    navigator.serviceWorker.controller?.postMessage({ type: 'GENFACTORY_VERSION' });
  };
  const inspect = () => {
    if (registration?.waiting && navigator.serviceWorker.controller) onAvailable();
  };
  const updateFound = () => {
    const worker = registration?.installing;
    worker?.addEventListener('statechange', () => {
      if (!stopped && worker.state === 'installed') inspect();
    });
  };
  navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
  navigator.serviceWorker.addEventListener('message', version);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  const timer = setInterval(check, 60_000);
  void navigator.serviceWorker
    .register(WORKER_PATH, { scope: '/', updateViaCache: 'none' })
    .then((value) => {
      if (stopped) return;
      registration = value;
      registration.addEventListener('updatefound', updateFound);
      updateFound();
      inspect();
      check();
    })
    .catch(() => {});
  return {
    apply() {
      if (registration?.waiting) {
        requested = true;
        registration.waiting.postMessage({ type: 'GENFACTORY_ACTIVATE' });
      } else onReload();
    },
    dispose() {
      stopped = true;
      clearInterval(timer);
      registration?.removeEventListener('updatefound', updateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.removeEventListener('message', version);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    },
  };
}
