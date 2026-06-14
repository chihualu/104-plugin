/**
 * 簡單的 in-isolate TTL 快取，取代原本的 lru-cache。
 * 注意：Workers 的記憶體只在同一個 isolate 生命週期內共用，不保證跨請求持久 —
 * 對「公司名稱（24h）」「薪資彙總（10min）」這種純加速用途已足夠（miss 就重算）。
 */
export class TtlCache<V> {
  private store = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 500) {}

  get(key: string): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.v;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { v: value, exp: Date.now() + this.ttlMs });
  }
}
