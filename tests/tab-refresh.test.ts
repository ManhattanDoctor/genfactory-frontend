import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeTabReturn } from '../src/features/realtime/tabRefresh';
let tab: EventTarget & { hidden: boolean };
let network: { onLine: boolean };
let dispose: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  tab = Object.assign(new EventTarget(), { hidden: false });
  network = { onLine: true };
  vi.stubGlobal('document', tab);
  vi.stubGlobal('navigator', network);
});
afterEach(() => {
  dispose?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function visible(hidden: boolean) {
  tab.hidden = hidden;
  tab.dispatchEvent(new Event('visibilitychange'));
}
it('does not refresh a connected tab after a short absence or a duplicate visible event', () => {
  const refresh = vi.fn();
  dispose = observeTabReturn(refresh, () => true);
  visible(true);
  vi.advanceTimersByTime(59_999);
  visible(false);
  visible(false);
  expect(refresh).not.toHaveBeenCalled();
});
it('refreshes once at one minute and starts a new interval for the next absence', () => {
  const refresh = vi.fn();
  dispose = observeTabReturn(refresh, () => true);
  visible(true);
  vi.advanceTimersByTime(30_000);
  visible(true);
  vi.advanceTimersByTime(30_000);
  visible(false);
  visible(false);
  expect(refresh).toHaveBeenCalledTimes(1);
  visible(true);
  vi.advanceTimersByTime(1000);
  visible(false);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('uses the current connection state on return without resetting the hidden duration', () => {
  const refresh = vi.fn();
  let connected = true;
  dispose = observeTabReturn(refresh, () => connected);
  visible(true);
  vi.advanceTimersByTime(1);
  connected = false;
  visible(false);
  expect(refresh).toHaveBeenCalledTimes(1);
  visible(true);
  vi.advanceTimersByTime(60_000);
  connected = true;
  visible(false);
  expect(refresh).toHaveBeenCalledTimes(2);
});
it('does not request while hidden or offline and cleans up its listener', () => {
  const refresh = vi.fn();
  dispose = observeTabReturn(refresh, () => false);
  visible(true);
  vi.advanceTimersByTime(120_000);
  expect(refresh).not.toHaveBeenCalled();
  network.onLine = false;
  visible(false);
  expect(refresh).not.toHaveBeenCalled();
  network.onLine = true;
  visible(true);
  dispose();
  visible(false);
  expect(refresh).not.toHaveBeenCalled();
});
it('tracks a tab that was already hidden when the session started', () => {
  const refresh = vi.fn();
  tab.hidden = true;
  dispose = observeTabReturn(refresh, () => true);
  vi.advanceTimersByTime(60_000);
  visible(false);
  expect(refresh).toHaveBeenCalledTimes(1);
});
