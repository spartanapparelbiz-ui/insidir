/* A concurrency limiter: at most `max` tasks run at once, the rest wait in order. One limiter is shared by all
 * wallet calls in the process, so many X-rays at once never put more than WALLET_CONCURRENCY calls in flight. */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function limiter(max: number): Limiter {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const run = queue.shift();
    if (run) { active++; run(); }
  };
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => { active--; next(); });
    });
    next();
  });
}

export const WALLET_CONCURRENCY = 8;
const G = globalThis as typeof globalThis & { __insidirWalletLimit?: Limiter };
export const walletLimit: Limiter = (G.__insidirWalletLimit ??= limiter(WALLET_CONCURRENCY));
