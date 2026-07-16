import { readFile, writeFile } from "node:fs/promises";

const [, , counter, rawValue] = process.argv;
if (!/^(country-[A-Z]{2}|search-uses|prediction-uses)$/.test(counter ?? "")) {
  throw new Error(
    "Counter must be country-XX, search-uses, or prediction-uses.",
  );
}

const value = Number(rawValue);
if (!Number.isSafeInteger(value) || value < 0) {
  throw new Error("Value must be a non-negative integer.");
}

const path = new URL("../public/counter-floors.json", import.meta.url);
const floors = JSON.parse(await readFile(path, "utf8"));
const current = Number(floors[counter] ?? 0);
if (value < current) {
  throw new Error(
    `Refusing to lower ${counter} from ${current} to ${value}. Counters are monotonic.`,
  );
}

floors[counter] = value;
const sorted = Object.fromEntries(
  Object.entries(floors).sort(([left], [right]) => left.localeCompare(right)),
);
await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
console.log(`${counter}: ${current} -> ${value}`);
