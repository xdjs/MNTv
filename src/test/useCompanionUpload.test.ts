import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCompanionUpload } from '../hooks/useCompanionUpload';
afterEach(() => vi.useRealTimers());
it('coalesces snapshots and waits for generation to settle', async () => {
  vi.useFakeTimers(); const upload = vi.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(({ signature, busy }) => useCompanionUpload('track', signature, busy, upload), { initialProps: { signature: '1', busy: true } });
  rerender({ signature: '9', busy: true });
  await act(() => vi.advanceTimersByTimeAsync(2000)); expect(upload).not.toHaveBeenCalled();
  rerender({ signature: '9', busy: false });
  await act(() => vi.advanceTimersByTimeAsync(1500)); expect(upload).toHaveBeenCalledTimes(1);
  rerender({ signature: '9', busy: false });
  await act(() => vi.advanceTimersByTimeAsync(70000)); expect(upload).toHaveBeenCalledTimes(1);
});
it('retries failed snapshots after the quota window, recording only success', async () => {
  vi.useFakeTimers(); const upload = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValue(undefined);
  renderHook(() => useCompanionUpload('track', '9', false, upload));
  await act(() => vi.advanceTimersByTimeAsync(1500)); expect(upload).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(64999)); expect(upload).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(1)); expect(upload).toHaveBeenCalledTimes(2);
});
it('serializes in-flight uploads and sends the latest pending snapshot', async () => {
  vi.useFakeTimers(); let finish!: () => void;
  const upload = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  const { rerender } = renderHook(({ signature }) => useCompanionUpload('track', signature, false, upload), { initialProps: { signature: '1' } });
  await act(() => vi.advanceTimersByTimeAsync(1500));
  rerender({ signature: '9' }); await act(() => vi.advanceTimersByTimeAsync(70000)); expect(upload).toHaveBeenCalledTimes(1);
  await act(async () => finish()); await act(() => vi.advanceTimersByTimeAsync(1500)); expect(upload).toHaveBeenCalledTimes(2);
});
it('cancels scheduled work on unmount', async () => {
  vi.useFakeTimers(); const upload = vi.fn();
  const { unmount } = renderHook(() => useCompanionUpload('track', '9', false, upload));
  unmount(); await act(() => vi.advanceTimersByTimeAsync(100000)); expect(upload).not.toHaveBeenCalled();
});
it('stops after three failed attempts and retries a newer snapshot', async () => {
  vi.useFakeTimers(); const upload = vi.fn().mockRejectedValue(new Error('unavailable'));
  const { rerender } = renderHook(({ signature }) => useCompanionUpload('track', signature, false, upload), { initialProps: { signature: '1' } });
  await act(() => vi.advanceTimersByTimeAsync(1500));
  await act(() => vi.advanceTimersByTimeAsync(65000));
  await act(() => vi.advanceTimersByTimeAsync(65000));
  await act(() => vi.advanceTimersByTimeAsync(65000)); expect(upload).toHaveBeenCalledTimes(3);
  rerender({ signature: '9' }); await act(() => vi.advanceTimersByTimeAsync(1500)); expect(upload).toHaveBeenCalledTimes(4);
});
it('prevents an old request from updating the current track', async () => {
  vi.useFakeTimers(); let current!: () => boolean; let finish!: () => void;
  const upload = vi.fn().mockImplementationOnce((isCurrent) => { current = isCurrent; return new Promise<void>(resolve => { finish = resolve; }); }).mockResolvedValue(undefined);
  const { rerender } = renderHook(({ key }) => useCompanionUpload(key, '9', false, upload), { initialProps: { key: 'old' } });
  await act(() => vi.advanceTimersByTimeAsync(1500)); expect(current()).toBe(true);
  rerender({ key: 'new' }); expect(current()).toBe(false);
  await act(async () => finish());
  await act(() => vi.advanceTimersByTimeAsync(65000)); expect(upload).toHaveBeenCalledTimes(2);
});
it('keeps an old request stale after navigating A to B to A', async () => {
  vi.useFakeTimers(); let current!: () => boolean; let finish!: () => void;
  const upload = vi.fn().mockImplementationOnce((isCurrent) => { current = isCurrent; return new Promise<void>(resolve => { finish = resolve; }); }).mockResolvedValue(undefined);
  const { rerender } = renderHook(({ key }) => useCompanionUpload(key, '9', false, upload), { initialProps: { key: 'A' } });
  await act(() => vi.advanceTimersByTimeAsync(1500));
  rerender({ key: 'B' }); rerender({ key: 'A' }); expect(current()).toBe(false);
  await act(async () => finish()); await act(() => vi.advanceTimersByTimeAsync(65000)); expect(upload).toHaveBeenCalledTimes(2);
});
it('restores readiness only for an accepted snapshot at the same listen depth', async () => {
  vi.useFakeTimers(); const upload = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(({ key, busy }) => useCompanionUpload(key, '9', busy, upload), { initialProps: { key: 'A-depth1', busy: false } });
  expect(result.current).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(1500)); expect(result.current).toBe(true);
  rerender({ key: 'B-depth1', busy: false }); expect(result.current).toBe(false);
  rerender({ key: 'A-depth1', busy: false }); expect(result.current).toBe(true);
  rerender({ key: 'A-depth2', busy: true }); expect(result.current).toBe(false);
  rerender({ key: 'A-depth2', busy: false }); expect(result.current).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(65000)); expect(result.current).toBe(true);
});
