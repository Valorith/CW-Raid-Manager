import type { FastifyReply, FastifyRequest } from 'fastify';

type RateLimitOptions = {
  key: string;
  maxRequests: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

function cleanupExpiredBuckets(now: number): void {
  if (now - lastCleanupAt < 60_000) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }

  lastCleanupAt = now;
}

function setRateLimitHeaders(
  reply: FastifyReply,
  maxRequests: number,
  remaining: number,
  resetAt: number
): void {
  reply.header('X-RateLimit-Limit', String(maxRequests));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  reply.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
}

export function createIpRateLimitPreHandler(options: RateLimitOptions) {
  const { key, maxRequests, windowMs } = options;

  return async function ipRateLimitPreHandler(request: FastifyRequest, reply: FastifyReply) {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const bucketKey = `${key}:${request.ip || 'unknown'}`;
    const existingBucket = rateLimitBuckets.get(bucketKey);

    if (!existingBucket || existingBucket.resetAt <= now) {
      const newBucket: RateLimitBucket = {
        count: 1,
        resetAt: now + windowMs
      };
      rateLimitBuckets.set(bucketKey, newBucket);
      setRateLimitHeaders(reply, maxRequests, maxRequests - 1, newBucket.resetAt);
      return;
    }

    if (existingBucket.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingBucket.resetAt - now) / 1000));
      setRateLimitHeaders(reply, maxRequests, 0, existingBucket.resetAt);
      reply.header('Retry-After', String(retryAfterSeconds));
      reply.code(429).send({
        error: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`
      });
      return;
    }

    existingBucket.count += 1;
    setRateLimitHeaders(
      reply,
      maxRequests,
      maxRequests - existingBucket.count,
      existingBucket.resetAt
    );
  };
}
