const EVENT_TYPES = new Set(["page_view", "search", "prediction"]);
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const HOUR = 60 * 60 * 1000;
const LEGACY_MIGRATION_KEY = "migration:counterapi-history:2026-07-18";
const LEGACY_METRIC_BASELINES = {
  search: 225,
  prediction: 901,
};
const LEGACY_COUNTRY_BASELINES = {
  US: 244,
  CN: 602,
  JP: 13,
  HK: 13,
  SG: 9,
  CA: 4,
  DE: 3,
  NL: 2,
  NZ: 2,
  GB: 2,
  AU: 1,
  TW: 1,
  SA: 1,
  RO: 1,
  CZ: 1,
  CO: 1,
  LU: 1,
  BD: 1,
  // Preserves the legacy total above 1,000 without assigning unknown visits
  // to a country that cannot be recovered from the old browser-local cache.
  ZZ: 99,
};

function json(data, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers,
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  return origin === env.ALLOWED_ORIGIN ? origin : "";
}

async function sourceHash(request, env, type) {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bucket = new Date().toISOString().slice(0, 13);
  const payload = new TextEncoder().encode(
    `${env.RATE_LIMIT_SALT}:${bucket}:${type}:${address}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function storeRequest(env, path, init) {
  const id = env.ANALYTICS.idFromName("global");
  const stub = env.ANALYTICS.get(id);
  return stub.fetch(`https://analytics.internal${path}`, init);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, storage: "durable-object" });
    }

    const origin = allowedOrigin(request, env);
    if (!origin) return json({ error: "Origin not allowed" }, 403);

    if (request.method === "OPTIONS") return json({ ok: true }, 204, origin);

    if (url.pathname === "/v1/summary" && request.method === "GET") {
      const response = await storeRequest(env, "/summary", { method: "GET" });
      return json(await response.json(), response.status, origin);
    }

    if (url.pathname === "/v1/events" && request.method === "POST") {
      if (!env.RATE_LIMIT_SALT) {
        return json({ error: "Analytics service is not initialized" }, 503, origin);
      }
      const contentLength = Number(request.headers.get("Content-Length") ?? 0);
      if (contentLength > 1024) return json({ error: "Payload too large" }, 413, origin);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400, origin);
      }
      if (!EVENT_TYPES.has(body?.type) || !EVENT_ID_PATTERN.test(body?.eventId ?? "")) {
        return json({ error: "Invalid analytics event" }, 400, origin);
      }

      const countryValue = request.cf?.country?.toUpperCase() ?? "ZZ";
      const country = COUNTRY_PATTERN.test(countryValue) ? countryValue : "ZZ";
      const hash = await sourceHash(request, env, body.type);
      const response = await storeRequest(env, "/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: body.eventId,
          type: body.type,
          country,
          sourceHash: hash,
        }),
      });
      return json(await response.json(), response.status, origin);
    }

    return json({ error: "Not found" }, 404, origin);
  },
};

export class AnalyticsStore {
  constructor(state) {
    this.storage = state.storage;
  }

  async ensureLegacyMigration() {
    if (await this.storage.get(LEGACY_MIGRATION_KEY)) return;

    await this.storage.transaction(async (transaction) => {
      if (await transaction.get(LEGACY_MIGRATION_KEY)) return;

      const existingCountries = await transaction.list({ prefix: "country:" });
      const mergedCountries = new Map(
        Array.from(existingCountries.entries()).map(([key, count]) => [
          key.slice(8),
          Number(count),
        ]),
      );
      for (const [code, baseline] of Object.entries(LEGACY_COUNTRY_BASELINES)) {
        mergedCountries.set(
          code,
          Math.max(mergedCountries.get(code) ?? 0, baseline),
        );
      }

      const currentViews = Number(
        (await transaction.get("metric:page_view")) ?? 0,
      );
      let countryTotal = Array.from(mergedCountries.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      if (currentViews > countryTotal) {
        const difference = currentViews - countryTotal;
        mergedCountries.set("ZZ", (mergedCountries.get("ZZ") ?? 0) + difference);
        countryTotal = currentViews;
      }

      for (const [code, count] of mergedCountries) {
        await transaction.put(`country:${code}`, count);
      }
      await transaction.put("metric:page_view", countryTotal);

      for (const [metric, baseline] of Object.entries(LEGACY_METRIC_BASELINES)) {
        const key = `metric:${metric}`;
        const current = Number((await transaction.get(key)) ?? 0);
        await transaction.put(key, Math.max(current, baseline));
      }

      await transaction.put(LEGACY_MIGRATION_KEY, new Date().toISOString());
    });
  }

  async summary() {
    await this.ensureLegacyMigration();
    const [pageViews, searchUses, predictionUses, verifiedSince, countryEntries] =
      await Promise.all([
        this.storage.get("metric:page_view"),
        this.storage.get("metric:search"),
        this.storage.get("metric:prediction"),
        this.storage.get("metadata:verified_since"),
        this.storage.list({ prefix: "country:" }),
      ]);
    const countries = Array.from(countryEntries.entries())
      .map(([key, count]) => ({ code: key.slice(8), count: Number(count) }))
      .filter(({ code, count }) => COUNTRY_PATTERN.test(code) && count > 0)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    return {
      totalViews: Number(pageViews ?? 0),
      searchUses: Number(searchUses ?? 0),
      predictionUses: Number(predictionUses ?? 0),
      countries,
      updatedAt: new Date().toISOString(),
      verifiedSince: typeof verifiedSince === "string" ? verifiedSince : null,
    };
  }

  async record(event) {
    await this.ensureLegacyMigration();
    const limit = event.type === "page_view" ? 120 : 60;
    const rateKey = `rate:${event.type}:${event.sourceHash}`;
    const eventKey = `event:${event.eventId}`;
    const now = Date.now();
    const result = await this.storage.transaction(async (transaction) => {
      if (await transaction.get(eventKey)) return { duplicate: true };
      const rate = Number((await transaction.get(rateKey)) ?? 0);
      if (rate >= limit) return { limited: true };

      await transaction.put(rateKey, rate + 1, {
        expiration: Math.floor((now + 2 * HOUR) / 1000),
      });
      await transaction.put(eventKey, true, {
        expiration: Math.floor((now + 7 * 24 * HOUR) / 1000),
      });

      if (!(await transaction.get("metadata:verified_since"))) {
        await transaction.put("metadata:verified_since", new Date(now).toISOString());
      }

      const metricKey = `metric:${event.type}`;
      const metric = Number((await transaction.get(metricKey)) ?? 0) + 1;
      await transaction.put(metricKey, metric);

      if (event.type === "page_view") {
        const countryKey = `country:${event.country}`;
        const count = Number((await transaction.get(countryKey)) ?? 0) + 1;
        await transaction.put(countryKey, count);
      }
      return { recorded: true };
    });
    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/summary" && request.method === "GET") {
      return json(await this.summary());
    }
    if (url.pathname === "/event" && request.method === "POST") {
      const event = await request.json();
      const result = await this.record(event);
      if (result.limited) return json({ error: "Rate limit exceeded" }, 429);
      return json(await this.summary());
    }
    return json({ error: "Not found" }, 404);
  }
}
