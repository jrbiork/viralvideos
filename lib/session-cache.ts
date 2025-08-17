// In-memory cache for session data with configurable TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class SessionCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;
  private maxSize: number;

  constructor(ttlMinutes: number = 60, maxSize: number = 1000) {
    this.ttl = ttlMinutes * 60 * 1000; // Convert minutes to milliseconds
    this.maxSize = maxSize;
  }

  private getCacheKey(key: string): string {
    return key;
  }

  get(key: string): T | null {
    const cacheKey = this.getCacheKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    const cacheKey = this.getCacheKey(key);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    // Clean up old entries to prevent memory leaks
    this.cleanup();
  }

  delete(key: string): boolean {
    const cacheKey = this.getCacheKey(key);
    return this.cache.delete(cacheKey);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private cleanup(): void {
    if (this.cache.size <= this.maxSize) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Specialized session cache for user session data
export class UserSessionCache extends SessionCache<any> {
  constructor() {
    super(60, 1000); // 1 hour TTL, max 1000 entries
  }

  getSession(userId: string, token: string): any | null {
    const cacheKey = this.createSessionKey(userId, token);
    return this.get(cacheKey);
  }

  setSession(userId: string, token: string, userData: any): void {
    const cacheKey = this.createSessionKey(userId, token);
    this.set(cacheKey, userData);
  }

  deleteSession(userId: string, token: string): boolean {
    const cacheKey = this.createSessionKey(userId, token);
    return this.delete(cacheKey);
  }

  private createSessionKey(userId: string, token: string): string {
    return `${userId}:${token.substring(0, 20)}`; // Use first 20 chars of token
  }
}

// Global instance for user sessions
export const userSessionCache = new UserSessionCache();
