/** Run `worker` over `items` with at most `concurrency` in flight. Stops taking new items after `shouldStop()` is true. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (!shouldStop()) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}
