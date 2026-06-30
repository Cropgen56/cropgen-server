#!/usr/bin/env node
/**
 * Smoke-test biodrops shop API (public + auth-gated routes).
 * Usage: node scripts/verify-shop-api.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:7070
 */
const base = (process.argv[2] || "http://127.0.0.1:7070").replace(/\/$/, "");
const prefix = `${base}/v1/api/biodrops/shop`;

async function check(name, url, { expectStatus } = {}) {
  const res = await fetch(url);
  const ok = expectStatus ? res.status === expectStatus : res.ok;
  const body = await res.text();
  console.log(`${ok ? "✓" : "✗"} ${name} → ${res.status}`);
  if (!ok) {
    console.log(body.slice(0, 200));
    process.exitCode = 1;
  }
  return body;
}

async function main() {
  console.log(`Shop API smoke test: ${prefix}\n`);
  await check("GET /products", `${prefix}/products`);
  await check("GET /products?category=biofertilizer&limit=1", `${prefix}/products?category=biofertilizer&limit=1`);
  await check("GET /cart (auth required)", `${prefix}/cart`, { expectStatus: 401 });
  await check("GET /addresses (auth required)", `${prefix}/addresses`, { expectStatus: 401 });
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
