export async function withTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.error(`[tool:${name}] ${Date.now() - start}ms`);
  }
}
