import { mkdir, readFile, writeFile } from "node:fs/promises";

const namespace = "codingwzl-electrolyte-design";
const endpoint = `https://api.counterapi.dev/v1/${namespace}`;
const countryCodes = ["US", "CA", "BR", "GB", "FR", "DE", "CN", "JP", "KR", "IN", "SG", "AU"];

let previous = { visits: 0, countries: {}, usage: {} };
try {
  previous = JSON.parse(await readFile(new URL("../public/data/reach.json", import.meta.url), "utf8"));
} catch {
  // The first snapshot has no previous file.
}

async function read(name, fallback = 0) {
  try {
    const response = await fetch(`${endpoint}/${name}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return fallback;
    const data = await response.json();
    return Number(data.count ?? data.value ?? fallback);
  } catch {
    return fallback;
  }
}

const visits = await read("site-visits", previous.visits);
const countries = Object.fromEntries(
  await Promise.all(
    countryCodes.map(async (code) => [
      code,
      await read(`country-${code}`, previous.countries[code] ?? 0),
    ]),
  ),
);
const usage = {
  "search-uses": await read("search-uses", previous.usage?.["search-uses"] ?? 0),
  "prediction-uses": await read("prediction-uses", previous.usage?.["prediction-uses"] ?? 0),
};
const snapshot = { visits, countries, usage, updatedAt: new Date().toISOString() };

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/data/reach.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`,
);
console.log(`Reach snapshot: ${visits} visits across ${Object.values(countries).filter(Boolean).length} countries`);
