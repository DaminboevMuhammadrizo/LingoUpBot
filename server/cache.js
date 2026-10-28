// In-memory cache on a Map, limited by bytes (not by count, not by time — there is no TTL).
// When the budget is exceeded the least requested entries leave first (LFU); hit counts are halved
// every few minutes so that something popular last month does not stay forever.
// Entries that leave RAM can be "spilled" to a disk directory (a controlled swap): reading them back
// from local disk is far cheaper than downloading them again from Telegram.
import { mkdirSync, readFileSync, writeFile, unlink, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class ByteLFU {
  /**
   * @param {object} o
   * @param {number} o.maxBytes   RAM budget for values
   * @param {string} [o.diskDir]  where evicted spillable values go (second level)
   * @param {number} [o.diskMaxBytes]
   */
  constructor({ maxBytes, diskDir = null, diskMaxBytes = 0, decayMs = 10 * 60_000 }) {
    this.max = maxBytes;
    this.bytes = 0;
    this.map = new Map(); // key -> { value, size, hits, last, spill }
    this.loading = new Map(); // key -> Promise (one load per key, however many requests wait)
    this.stats = { hits: 0, misses: 0, diskHits: 0, evicted: 0, spilled: 0 };
    this.disk = diskDir ? { dir: diskDir, max: diskMaxBytes, bytes: 0, files: new Map() } : null;
    if (this.disk) this.#scanDisk();
    this.decayTimer = setInterval(() => this.#decay(), decayMs);
    this.decayTimer.unref();
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    e.hits++;
    e.last = Date.now();
    this.stats.hits++;
    return e.value;
  }

  /** value: any object; size: its weight in bytes; spill: write to disk instead of dropping on eviction */
  set(key, value, size, { spill = false, encode = null } = {}) {
    if (size > this.max / 8) return value; // a single huge item must not flush the whole cache
    const old = this.map.get(key);
    if (old) this.bytes -= old.size;
    this.map.set(key, { value, size, hits: old?.hits ?? 1, last: Date.now(), spill, encode });
    this.bytes += size;
    if (this.bytes > this.max) this.shrink(0.9);
    return value;
  }

  delete(key) {
    const e = this.map.get(key);
    if (!e) return;
    this.bytes -= e.size;
    this.map.delete(key);
  }

  /**
   * RAM → disk → loader(). Concurrent calls for the same key share one load.
   * loader returns { value, size, spill?, encode? }; decode(buffer) rebuilds a value read from disk.
   */
  async getOrLoad(key, loader, decode = null) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.loading.has(key)) return this.loading.get(key);
    this.stats.misses++;
    const p = (async () => {
      if (this.disk && decode) {
        const buf = this.#readDisk(key);
        if (buf) {
          this.stats.diskHits++;
          const r = decode(buf);
          return this.set(key, r.value, r.size, { spill: true, encode: r.encode });
        }
      }
      const r = await loader();
      return this.set(key, r.value, r.size, { spill: !!r.spill, encode: r.encode });
    })().finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }

  /** evict until at most `ratio` of the budget is used */
  shrink(ratio) {
    const target = this.max * ratio;
    if (this.bytes <= target) return;
    // least hits first, then least recently used
    const order = [...this.map.entries()].sort((a, b) => a[1].hits - b[1].hits || a[1].last - b[1].last);
    for (const [key, e] of order) {
      if (this.bytes <= target) break;
      this.map.delete(key);
      this.bytes -= e.size;
      this.stats.evicted++;
      if (e.spill && e.encode && this.disk) this.#writeDisk(key, e.encode(e.value));
    }
  }

  info() {
    return {
      entries: this.map.size,
      mb: +(this.bytes / 2 ** 20).toFixed(1),
      maxMb: +(this.max / 2 ** 20).toFixed(0),
      diskEntries: this.disk?.files.size ?? 0,
      diskMb: this.disk ? +(this.disk.bytes / 2 ** 20).toFixed(1) : 0,
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses ? +(this.stats.hits / (this.stats.hits + this.stats.misses)).toFixed(3) : 0,
      top: [...this.map.entries()].sort((a, b) => b[1].hits - a[1].hits).slice(0, 5).map(([k, e]) => `${k}:${e.hits}`),
    };
  }

  #decay() {
    for (const e of this.map.values()) e.hits = Math.max(1, e.hits >> 1);
  }

  // ---- disk level
  #file(key) {
    return resolve(this.disk.dir, encodeURIComponent(key));
  }
  #scanDisk() {
    mkdirSync(this.disk.dir, { recursive: true });
    for (const name of readdirSync(this.disk.dir)) {
      const st = statSync(resolve(this.disk.dir, name));
      this.disk.files.set(decodeURIComponent(name), { size: st.size, at: st.mtimeMs });
      this.disk.bytes += st.size;
    }
  }
  #readDisk(key) {
    const f = this.disk.files.get(key);
    if (!f) return null;
    try {
      f.at = Date.now();
      return readFileSync(this.#file(key));
    } catch {
      this.disk.files.delete(key);
      this.disk.bytes -= f.size;
      return null;
    }
  }
  #writeDisk(key, buf) {
    if (!buf || this.disk.files.has(key)) return;
    this.disk.files.set(key, { size: buf.length, at: Date.now() });
    this.disk.bytes += buf.length;
    this.stats.spilled++;
    writeFile(this.#file(key), buf, () => {});
    if (this.disk.bytes > this.disk.max) {
      // oldest files leave the disk level
      const order = [...this.disk.files.entries()].sort((a, b) => a[1].at - b[1].at);
      for (const [k, f] of order) {
        if (this.disk.bytes <= this.disk.max * 0.9) break;
        this.disk.files.delete(k);
        this.disk.bytes -= f.size;
        unlink(this.#file(k), () => {});
      }
    }
  }
}
