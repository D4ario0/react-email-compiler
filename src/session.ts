export interface CompilationSessionStats {
  cacheHits: number;
  cacheMisses: number;
  modules: number;
}

export class CompilationSession {
  #caches = new Map<string, Map<string, Promise<unknown>>>();
  #stats: CompilationSessionStats = {
    cacheHits: 0,
    cacheMisses: 0,
    modules: 0,
  };

  beginModule(): void {
    this.#stats.modules++;
  }

  memoize<Value>(namespace: string, key: string, factory: () => Promise<Value>): Promise<Value> {
    let cache = this.#caches.get(namespace);
    if (!cache) {
      cache = new Map();
      this.#caches.set(namespace, cache);
    }

    const existing = cache.get(key) as Promise<Value> | undefined;
    if (existing) {
      this.#stats.cacheHits++;
      return existing;
    }

    this.#stats.cacheMisses++;
    const value = factory();
    cache.set(key, value);
    void value.catch(() => cache?.delete(key));
    return value;
  }

  stats(): Readonly<CompilationSessionStats> {
    return { ...this.#stats };
  }

  reset(): void {
    this.#caches.clear();
    this.#stats = {
      cacheHits: 0,
      cacheMisses: 0,
      modules: 0,
    };
  }
}
