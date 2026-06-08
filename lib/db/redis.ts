import { Redis } from "ioredis";

let redisClient: Redis | null = null;
const memoryCache = new Map<string, { value: string; expiry: number }>();

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on("error", (err) => {
      console.warn("Redis connection error, falling back to in-memory cache:", err.message);
    });
  } catch (err) {
    console.warn("Failed to initialize Redis client, falling back to in-memory cache:", err);
  }
} else {
  console.log("No REDIS_URL provided; using in-memory cache for challenge storage.");
}

export const challengeStore = {
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (redisClient) {
      try {
        await redisClient.set(key, value, "EX", ttlSeconds);
        return;
      } catch (err) {
        console.warn("Redis set failed, saving to in-memory:", err);
      }
    }
    const expiry = Date.now() + ttlSeconds * 1000;
    memoryCache.set(key, { value, expiry });
  },

  async get(key: string): Promise<string | null> {
    if (redisClient) {
      try {
        return await redisClient.get(key);
      } catch (err) {
        console.warn("Redis get failed, checking in-memory:", err);
      }
    }
    const cached = memoryCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
      memoryCache.delete(key);
      return null;
    }
    return cached.value;
  },

  async del(key: string): Promise<void> {
    if (redisClient) {
      try {
        await redisClient.del(key);
        return;
      } catch (err) {
        console.warn("Redis del failed, deleting in-memory:", err);
      }
    }
    memoryCache.delete(key);
  },
};
