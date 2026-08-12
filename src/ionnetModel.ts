const base = import.meta.env.BASE_URL;

type BranchWeights = {
  fc1w: number[][];
  fc1b: number[];
  fc2w: number[][];
  fc2b: number[];
  fc3w: number[][];
  fc3b: number[];
  valuew: number[][];
  valueb: number[];
  mhaValueW: number[][];
  mhaValueB: number[];
  outw: number[][];
  outb: number[];
};

type ModelWeights = {
  weights: number[];
  branches: BranchWeights[];
  fcw: number[][];
  fcb: number[];
};

type ModelBundle = {
  descriptor: {
    symbols: string[];
    magpieProperties: string[];
    magpie: Array<Array<number | null>>;
    megnet: Array<Array<number | null>>;
  };
  models: ModelWeights[];
};

export type IonNetPrediction = {
  formula: string;
  pSigma: number;
  logConductivity: number;
  conductivity: number;
  uncertainty: number;
  lowerLogConductivity: number;
  upperLogConductivity: number;
  ensemble: number[];
};

let modelPromise: Promise<ModelBundle> | undefined;

async function readCompressedJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model request failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await new Response(
        new Response(buffer).body!.pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : new TextDecoder().decode(buffer);
  return JSON.parse(text) as T;
}

function loadModel() {
  modelPromise ??= readCompressedJson<ModelBundle>(
    `${base}data/ionnet/ionnet-model.json.gz`,
  );
  return modelPromise;
}

function parseFormula(formula: string, validSymbols: Set<string>) {
  const source = formula.replace(/\s+/g, "");
  if (!source) throw new Error("Enter a chemical formula.");
  const tokens = source.match(/[A-Z][a-z]?|(?:\d+(?:\.\d*)?|\.\d+)|[()]/g) ?? [];
  if (tokens.join("") !== source) {
    throw new Error("Use element symbols, numbers and parentheses only.");
  }
  let cursor = 0;
  const isNumber = (value?: string) => Boolean(value && /^(?:\d|\.)/.test(value));
  const multiplier = () => (isNumber(tokens[cursor]) ? Number(tokens[cursor++]) : 1);

  function group(nested: boolean): Map<string, number> {
    const amounts = new Map<string, number>();
    while (cursor < tokens.length && tokens[cursor] !== ")") {
      if (tokens[cursor] === "(") {
        cursor += 1;
        const inner = group(true);
        if (tokens[cursor] !== ")") throw new Error("Unbalanced parentheses.");
        cursor += 1;
        const factor = multiplier();
        inner.forEach((amount, symbol) =>
          amounts.set(symbol, (amounts.get(symbol) ?? 0) + amount * factor),
        );
        continue;
      }
      const symbol = tokens[cursor++];
      if (!validSymbols.has(symbol)) throw new Error(`Unknown element symbol: ${symbol}`);
      const amount = multiplier();
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Stoichiometric coefficients must be positive numbers.");
      }
      amounts.set(symbol, (amounts.get(symbol) ?? 0) + amount);
    }
    if (nested && cursor >= tokens.length) throw new Error("Unbalanced parentheses.");
    return amounts;
  }

  const amounts = group(false);
  if (cursor !== tokens.length) throw new Error("Unbalanced parentheses.");
  const total = Array.from(amounts.values()).reduce((sum, value) => sum + value, 0);
  if (!total) throw new Error("No elements were found in the formula.");
  return Array.from(amounts, ([symbol, amount]) => ({ symbol, fraction: amount / total }));
}

function linear(input: number[], weights: number[][], bias: number[]) {
  return weights.map(
    (row, output) =>
      row.reduce((sum, weight, index) => sum + weight * input[index], bias[output]),
  );
}

function relu(values: number[]) {
  return values.map((value) => Math.max(0, value));
}

function branchForward(input: number[], branch: BranchWeights) {
  const first = relu(linear(input, branch.fc1w, branch.fc1b));
  const second = relu(linear(first, branch.fc2w, branch.fc2b));
  const third = relu(linear(second, branch.fc3w, branch.fc3b));
  const value = linear(third, branch.valuew, branch.valueb);
  const projectedValue = linear(value, branch.mhaValueW, branch.mhaValueB);
  return linear(projectedValue, branch.outw, branch.outb);
}

function weightedMean(values: number[], weights: number[]) {
  return values.reduce((sum, value, index) => sum + value * weights[index], 0);
}

function propertyStats(values: number[], fractions: number[], includeMode: boolean) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const mean = weightedMean(values, fractions);
  const averageDeviation = weightedMean(
    values.map((value) => Math.abs(value - mean)),
    fractions,
  );
  if (includeMode) {
    const maximumFraction = Math.max(...fractions);
    const mode = Math.min(
      ...values.filter((_, index) => Math.abs(fractions[index] - maximumFraction) < 1e-12),
    );
    return [minimum, maximum, maximum - minimum, mean, averageDeviation, mode];
  }
  if (values.length === 1) return [minimum, maximum, 0, mean, 0];
  const denominator = 1 - fractions.reduce((sum, value) => sum + value * value, 0);
  const variance = weightedMean(
    values.map((value) => (value - mean) ** 2),
    fractions,
  );
  return [minimum, maximum, maximum - minimum, mean, Math.sqrt(variance / denominator)];
}

function makeDescriptors(bundle: ModelBundle, formula: string) {
  const { descriptor } = bundle;
  const symbolIndex = new Map(descriptor.symbols.map((symbol, index) => [symbol, index]));
  const composition = parseFormula(formula, new Set(descriptor.symbols));
  const indices = composition.map(({ symbol }) => symbolIndex.get(symbol)!);
  const fractions = composition.map(({ fraction }) => fraction);
  const propertyIndex = new Map(
    descriptor.magpieProperties.map((property, index) => [property, index]),
  );
  const valuesFor = (property: string) => {
    const column = propertyIndex.get(property);
    if (column === undefined) throw new Error(`Missing descriptor property: ${property}`);
    return indices.map((index) => {
      const value = descriptor.magpie[index]?.[column];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        throw new Error(`${descriptor.symbols[index]} lacks the ${property} descriptor.`);
      }
      return value;
    });
  };
  const mean = (property: string) => weightedMean(valuesFor(property), fractions);
  const range = (property: string) => {
    const values = valuesFor(property);
    return Math.max(...values) - Math.min(...values);
  };

  const meredig = Array(103).fill(0) as number[];
  indices.forEach((index, position) => {
    meredig[index] = fractions[position];
  });
  meredig.push(
    mean("AtomicWeight"),
    mean("Column"),
    mean("Row"),
    range("Number"),
    mean("Number"),
    range("AtomicRadius"),
    mean("AtomicRadius"),
    range("Electronegativity"),
    mean("Electronegativity"),
  );
  const orbitalMeans = ["NsValence", "NpValence", "NdValence", "NfValence"].map(mean);
  const totalValence = mean("NValence");
  meredig.push(...orbitalMeans, ...orbitalMeans.map((value) => value / totalValence));

  const magpie = descriptor.magpieProperties
    .slice(0, 22)
    .flatMap((property) => propertyStats(valuesFor(property), fractions, true));

  const megnet = Array.from({ length: 16 }, (_, column) =>
    propertyStats(
      indices.map((index) => {
        const value = descriptor.megnet[index]?.[column];
        if (value === null || value === undefined || !Number.isFinite(value)) {
          throw new Error(`${descriptor.symbols[index]} lacks a MEGNet descriptor.`);
        }
        return value;
      }),
      fractions,
      false,
    ),
  ).flat();

  return [meredig, magpie, megnet];
}

export async function predictIonNet(formula: string): Promise<IonNetPrediction> {
  const bundle = await loadModel();
  const descriptors = makeDescriptors(bundle, formula);
  const ensemble = bundle.models.map((model) => {
    const branches = model.branches.map((branch, index) =>
      branchForward(descriptors[index], branch).map((value) => value * model.weights[index]),
    );
    return linear(branches.flat(), model.fcw, model.fcb)[0];
  });
  const pSigma = ensemble.reduce((sum, value) => sum + value, 0) / ensemble.length;
  const uncertainty = Math.sqrt(
    ensemble.reduce((sum, value) => sum + (value - pSigma) ** 2, 0) / ensemble.length,
  );
  const logConductivity = -pSigma;
  return {
    formula: formula.trim(),
    pSigma,
    logConductivity,
    conductivity: 10 ** logConductivity,
    uncertainty,
    lowerLogConductivity: logConductivity - uncertainty,
    upperLogConductivity: logConductivity + uncertainty,
    ensemble: ensemble.map((value) => -value),
  };
}
