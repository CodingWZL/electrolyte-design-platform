import assert from "node:assert/strict";
import test from "node:test";

import { AnalyticsStore } from "../src/index.js";

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  get(key) {
    return this.values.get(key);
  }

  put(key, value) {
    this.values.set(key, value);
  }

  list({ prefix }) {
    return new Map(
      Array.from(this.values).filter(([key]) => key.startsWith(prefix)),
    );
  }

  transaction(callback) {
    return callback(this);
  }
}

test("legacy totals migrate once and continue incrementing", async () => {
  const storage = new MemoryStorage([
    ["metric:page_view", 1],
    ["metric:search", 1],
    ["metric:prediction", 1],
    ["country:US", 1],
  ]);
  const store = new AnalyticsStore({ storage });

  const migrated = await store.summary();
  assert.equal(migrated.totalViews, 1001);
  assert.equal(migrated.searchUses, 225);
  assert.equal(migrated.predictionUses, 901);
  assert.equal(
    migrated.countries.reduce((sum, country) => sum + country.count, 0),
    migrated.totalViews,
  );

  await store.record({
    type: "page_view",
    eventId: "page-event",
    country: "US",
    sourceHash: "page-source",
  });
  await store.record({
    type: "search",
    eventId: "search-event",
    country: "US",
    sourceHash: "search-source",
  });
  await store.record({
    type: "prediction",
    eventId: "prediction-event",
    country: "US",
    sourceHash: "prediction-source",
  });

  const incremented = await new AnalyticsStore({ storage }).summary();
  assert.equal(incremented.totalViews, 1002);
  assert.equal(incremented.searchUses, 226);
  assert.equal(incremented.predictionUses, 902);
  assert.equal(
    incremented.countries.reduce((sum, country) => sum + country.count, 0),
    incremented.totalViews,
  );
});
