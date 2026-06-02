import { AsyncLocalStorage } from 'node:async_hooks';

export const captureStore = new AsyncLocalStorage();

export async function runCaptured(fn) {
  const sink = [];
  await captureStore.run(sink, fn);
  return sink;
}
