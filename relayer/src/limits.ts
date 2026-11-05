/** Drain protection layer 0 (spec K): sessions cost no gas, but they are still rate- and queue-limited. */
import type { SignedSession } from "@watermark/sdk";

/** Fixed one-minute window per key (an IP). In memory: the relayer is a single process. */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  private readonly perMinute: number;
  private readonly now: () => number;

  constructor(perMinute: number, now: () => number = Date.now) {
    this.perMinute = perMinute;
    this.now = now;
  }

  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= 60_000) {
      if (this.hits.size > 10_000) this.prune(t);
      this.hits.set(key, { windowStart: t, count: 1 });
      return true;
    }
    if (entry.count >= this.perMinute) return false;
    entry.count++;
    return true;
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (t - v.windowStart >= 60_000) this.hits.delete(k);
  }
}

/** Open sessions, kept until they expire so the app can use the QR fallback (GET /session/:id). */
export class SessionStore {
  private sessions = new Map<string, SignedSession>();
  private readonly max: number;
  private readonly nowSec: () => number;

  constructor(max: number, nowSec: () => number = () => Math.floor(Date.now() / 1000)) {
    this.max = max;
    this.nowSec = nowSec;
  }

  /** false when the store is full of live sessions. */
  put(id: string, s: SignedSession): boolean {
    if (this.sessions.size >= this.max) this.prune();
    if (this.sessions.size >= this.max) return false;
    this.sessions.set(id, s);
    return true;
  }

  get(id: string): SignedSession | undefined {
    const s = this.sessions.get(id);
    if (s && Number(s.session.expiresAt) <= this.nowSec()) {
      this.sessions.delete(id);
      return undefined;
    }
    return s;
  }

  private prune() {
    const t = this.nowSec();
    for (const [id, s] of this.sessions) if (Number(s.session.expiresAt) <= t) this.sessions.delete(id);
  }
}
