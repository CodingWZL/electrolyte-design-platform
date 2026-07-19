export const AVOGADRO = 6.02214076e23;
export const GAS_CONSTANT = 8.314462618;
export const FARADAY = 96485.33212;

export function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function linearRegression(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) {
    throw new Error("At least two paired observations are required.");
  }
  const xMean = mean(x);
  const yMean = mean(y);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < x.length; index += 1) {
    numerator += (x[index] - xMean) * (y[index] - yMean);
    denominator += (x[index] - xMean) ** 2;
  }
  if (!denominator) throw new Error("The independent variable has no spread.");
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const predicted = x.map((value) => intercept + slope * value);
  const residualSum = y.reduce(
    (sum, value, index) => sum + (value - predicted[index]) ** 2,
    0,
  );
  const totalSum = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  return {
    slope,
    intercept,
    predicted,
    residualSum,
    r2: totalSum ? 1 - residualSum / totalSum : 1,
  };
}

export function parseDelimited(text: string) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [] as string[][];
  const delimiter = lines[0].includes("\t")
    ? "\t"
    : lines[0].includes(",")
      ? ","
      : /\s+/;
  return lines.map((line) =>
    typeof delimiter === "string"
      ? line.split(delimiter).map((cell) => cell.trim())
      : line.split(delimiter).map((cell) => cell.trim()),
  );
}

export function toCsv(rows: Array<Array<string | number>>) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

export function downloadText(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function simplexPoints(parts: number, divisions: number) {
  const output: number[][] = [];
  const current = Array(parts).fill(0) as number[];
  const walk = (index: number, remaining: number) => {
    if (index === parts - 1) {
      current[index] = remaining;
      output.push(current.map((value) => value / divisions));
      return;
    }
    for (let value = 0; value <= remaining; value += 1) {
      current[index] = value;
      walk(index + 1, remaining - value);
    }
  };
  walk(0, divisions);
  return output;
}

export function paretoFront(
  rows: Record<string, string>[],
  objectives: Array<{ key: string; direction: "min" | "max" }>,
) {
  return rows.filter((candidate, candidateIndex) =>
    !rows.some((other, otherIndex) => {
      if (candidateIndex === otherIndex) return false;
      let atLeastAsGood = true;
      let strictlyBetter = false;
      for (const objective of objectives) {
        const a = Number(candidate[objective.key]);
        const b = Number(other[objective.key]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        const betterOrEqual =
          objective.direction === "max" ? b >= a : b <= a;
        const better = objective.direction === "max" ? b > a : b < a;
        atLeastAsGood &&= betterOrEqual;
        strictlyBetter ||= better;
      }
      return atLeastAsGood && strictlyBetter;
    })
  );
}

