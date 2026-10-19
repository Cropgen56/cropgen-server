import IORedis from "ioredis";

function parseIntEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? fallback, 10);
}

export function createRedisConnection() {
  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = parseIntEnv("REDIS_PORT", 6379);
  // const password = process.env.REDIS_PASSWORD || undefined;

  const client = new IORedis({
    host,
    port,
    // password,
    // do not throw on first failed command, allow reconnects
    maxRetriesPerRequest: null,
    // reconnect strategy: exponential backoff capped at 2s
    retryStrategy(times) {
      const delay = Math.min(2000, 50 * Math.pow(2, times));
      return delay;
    },
    // enable ready check so we know when server is ready
    enableReadyCheck: true,
    // connectionName visible in Redis CLIENT LIST
    connectionName: `app-${process.pid}`,
  });

  client.on("error", (err) => {
    console.error("[redis] error:", err?.message || err);
  });

  client.on("close", () => {
    console.warn("[redis] connection closed");
  });

  return client;
}
