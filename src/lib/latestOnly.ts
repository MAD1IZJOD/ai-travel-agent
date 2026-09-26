/**
 * "Latest request wins" guard. Each call to `next()` supersedes the previous
 * ticket: its fetch is aborted and `isCurrent()` turns false, so a slow older
 * response can never overwrite a newer one.
 */
export interface Ticket {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export function createLatestOnly() {
  let current = 0;
  let controller: AbortController | null = null;
  return {
    next(): Ticket {
      controller?.abort();
      controller = new AbortController();
      const id = ++current;
      return { signal: controller.signal, isCurrent: () => id === current };
    },
    /** Supersede everything in flight without starting anything new. */
    cancel(): void {
      controller?.abort();
      controller = null;
      current += 1;
    },
  };
}
