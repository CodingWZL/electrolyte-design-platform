import { mean } from "./math";

export type ModelName =
  | "Mean baseline"
  | "Ridge regression"
  | "k-nearest neighbors"
  | "Random forest";

export type RegressionMetrics = {
  mae: number;
  rmse: number;
  r2: number;
};

export type BenchmarkConfig = {
  folds: number;
  seed: number;
  ridgeLambda: number;
  knnK: number;
  forestTrees: number;
  forestDepth: number;
};

export type BenchmarkResult = {
  models: Array<{
    name: ModelName;
    metrics: RegressionMetrics;
    predictions: number[];
  }>;
  bestModel: ModelName;
  importance: Array<{ feature: string; deltaRmse: number }>;
  predict: (rows: number[][]) => number[];
};

type Predictor = (row: number[]) => number;
type TreeNode = {
  value: number;
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(length: number, seed: number) {
  const output = Array.from({ length }, (_, index) => index);
  const random = seededRandom(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

function metrics(observed: number[], predicted: number[]): RegressionMetrics {
  const errors = observed.map((value, index) => value - predicted[index]);
  const mae = mean(errors.map(Math.abs));
  const rmse = Math.sqrt(mean(errors.map((value) => value ** 2)));
  const observedMean = mean(observed);
  const total = observed.reduce((sum, value) => sum + (value - observedMean) ** 2, 0);
  const residual = errors.reduce((sum, value) => sum + value ** 2, 0);
  return { mae, rmse, r2: total ? 1 - residual / total : 1 };
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row, index) =>
    Number.isFinite(row[size]) && Math.abs(row[index]) > 1e-12 ? row[size] : 0,
  );
}

function standardizer(rows: number[][]) {
  const width = rows[0].length;
  const means = Array.from({ length: width }, (_, column) => mean(rows.map((row) => row[column])));
  const scales = Array.from({ length: width }, (_, column) => {
    const variance = mean(rows.map((row) => (row[column] - means[column]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  return {
    transform: (row: number[]) => row.map((value, column) => (value - means[column]) / scales[column]),
  };
}

function fitRidge(x: number[][], y: number[], lambda: number): Predictor {
  const scale = standardizer(x);
  const normalized = x.map(scale.transform);
  const targetMean = mean(y);
  const width = x[0].length;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0) as number[]);
  const vector = Array(width).fill(0) as number[];
  normalized.forEach((row, rowIndex) => {
    for (let left = 0; left < width; left += 1) {
      vector[left] += row[left] * (y[rowIndex] - targetMean);
      for (let right = 0; right < width; right += 1) matrix[left][right] += row[left] * row[right];
    }
  });
  for (let index = 0; index < width; index += 1) matrix[index][index] += Math.max(lambda, 1e-9);
  const coefficients = solveLinearSystem(matrix, vector);
  return (row) => targetMean + scale.transform(row).reduce((sum, value, index) => sum + value * coefficients[index], 0);
}

function fitKnn(x: number[][], y: number[], neighbors: number): Predictor {
  const scale = standardizer(x);
  const normalized = x.map(scale.transform);
  const count = Math.max(1, Math.min(Math.round(neighbors), x.length));
  return (row) => {
    const target = scale.transform(row);
    const nearest = normalized
      .map((candidate, index) => ({
        value: y[index],
        distance: candidate.reduce((sum, value, column) => sum + (value - target[column]) ** 2, 0),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count);
    const exact = nearest.filter((item) => item.distance < 1e-14);
    if (exact.length) return mean(exact.map((item) => item.value));
    const weights = nearest.map((item) => 1 / Math.sqrt(item.distance + 1e-12));
    return nearest.reduce((sum, item, index) => sum + item.value * weights[index], 0) /
      weights.reduce((sum, value) => sum + value, 0);
  };
}

function sumSquaredError(indices: number[], y: number[]) {
  if (!indices.length) return 0;
  const center = mean(indices.map((index) => y[index]));
  return indices.reduce((sum, index) => sum + (y[index] - center) ** 2, 0);
}

function featureSubset(width: number, count: number, random: () => number) {
  const features = Array.from({ length: width }, (_, index) => index);
  for (let index = features.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [features[index], features[other]] = [features[other], features[index]];
  }
  return features.slice(0, count);
}

function buildTree(
  x: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minLeaf: number,
  random: () => number,
): TreeNode {
  const node: TreeNode = { value: mean(indices.map((index) => y[index])) };
  if (depth >= maxDepth || indices.length < minLeaf * 2 || sumSquaredError(indices, y) < 1e-12) return node;
  const width = x[0].length;
  const candidates = featureSubset(width, Math.max(1, Math.round(Math.sqrt(width))), random);
  let best:
    | { feature: number; threshold: number; score: number; left: number[]; right: number[] }
    | undefined;
  for (const feature of candidates) {
    const sorted = indices.map((index) => x[index][feature]).sort((a, b) => a - b);
    const thresholds = Array.from({ length: Math.min(10, sorted.length - 1) }, (_, step) => {
      const position = Math.min(sorted.length - 2, Math.floor(((step + 1) * sorted.length) / 11));
      return (sorted[position] + sorted[position + 1]) / 2;
    });
    for (const threshold of new Set(thresholds)) {
      const left = indices.filter((index) => x[index][feature] <= threshold);
      const right = indices.filter((index) => x[index][feature] > threshold);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const score = sumSquaredError(left, y) + sumSquaredError(right, y);
      if (!best || score < best.score) best = { feature, threshold, score, left, right };
    }
  }
  if (!best) return node;
  node.feature = best.feature;
  node.threshold = best.threshold;
  node.left = buildTree(x, y, best.left, depth + 1, maxDepth, minLeaf, random);
  node.right = buildTree(x, y, best.right, depth + 1, maxDepth, minLeaf, random);
  return node;
}

function treePrediction(node: TreeNode, row: number[]): number {
  if (node.feature === undefined || node.threshold === undefined || !node.left || !node.right) return node.value;
  return treePrediction(row[node.feature] <= node.threshold ? node.left : node.right, row);
}

function fitForest(x: number[][], y: number[], trees: number, depth: number, seed: number): Predictor {
  const random = seededRandom(seed);
  const count = Math.max(4, Math.min(100, Math.round(trees)));
  const minLeaf = Math.max(2, Math.floor(x.length / 80));
  const forest = Array.from({ length: count }, () => {
    const sample = Array.from({ length: x.length }, () => Math.floor(random() * x.length));
    return buildTree(x, y, sample, 0, Math.max(2, Math.min(12, Math.round(depth))), minLeaf, random);
  });
  return (row) => mean(forest.map((tree) => treePrediction(tree, row)));
}

function fitModel(name: ModelName, x: number[][], y: number[], config: BenchmarkConfig, seedOffset = 0): Predictor {
  if (name === "Mean baseline") {
    const value = mean(y);
    return () => value;
  }
  if (name === "Ridge regression") return fitRidge(x, y, config.ridgeLambda);
  if (name === "k-nearest neighbors") return fitKnn(x, y, config.knnK);
  return fitForest(x, y, config.forestTrees, config.forestDepth, config.seed + seedOffset);
}

const modelNames: ModelName[] = [
  "Mean baseline",
  "Ridge regression",
  "k-nearest neighbors",
  "Random forest",
];

export function benchmarkRegression(
  x: number[][],
  y: number[],
  featureNames: string[],
  config: BenchmarkConfig,
): BenchmarkResult {
  if (x.length !== y.length || x.length < 12) throw new Error("At least 12 complete numeric rows are required.");
  if (!x[0]?.length || x.some((row) => row.length !== x[0].length)) throw new Error("The feature matrix is inconsistent.");
  const foldCount = Math.max(3, Math.min(Math.round(config.folds), x.length));
  const order = shuffledIndices(x.length, config.seed);
  const foldByIndex = Array(x.length).fill(0) as number[];
  order.forEach((index, position) => { foldByIndex[index] = position % foldCount; });
  const predictionMap = new Map<ModelName, number[]>(modelNames.map((name) => [name, Array(x.length).fill(NaN)]));

  for (let fold = 0; fold < foldCount; fold += 1) {
    const train = Array.from({ length: x.length }, (_, index) => index).filter((index) => foldByIndex[index] !== fold);
    const test = Array.from({ length: x.length }, (_, index) => index).filter((index) => foldByIndex[index] === fold);
    const trainX = train.map((index) => x[index]);
    const trainY = train.map((index) => y[index]);
    for (const [modelIndex, name] of modelNames.entries()) {
      const predict = fitModel(name, trainX, trainY, config, fold * 101 + modelIndex * 17);
      const output = predictionMap.get(name)!;
      test.forEach((index) => { output[index] = predict(x[index]); });
    }
  }

  const models = modelNames.map((name) => ({
    name,
    metrics: metrics(y, predictionMap.get(name)!),
    predictions: predictionMap.get(name)!,
  })).sort((a, b) => a.metrics.rmse - b.metrics.rmse);
  const bestModel = models[0].name;

  const baseRmse = models[0].metrics.rmse;
  const importancePredictors = Array.from({ length: foldCount }, (_, fold) => {
    const train = Array.from({ length: x.length }, (_, index) => index).filter((index) => foldByIndex[index] !== fold);
    return fitModel(
      bestModel,
      train.map((index) => x[index]),
      train.map((index) => y[index]),
      config,
      fold * 101 + modelNames.indexOf(bestModel) * 17,
    );
  });
  const importance = featureNames.map((feature, featureIndex) => {
    const permutedPredictions = Array(x.length).fill(NaN) as number[];
    for (let fold = 0; fold < foldCount; fold += 1) {
      const test = Array.from({ length: x.length }, (_, index) => index).filter((index) => foldByIndex[index] === fold);
      const predict = importancePredictors[fold];
      const permutedValues = shuffledIndices(test.length, config.seed + featureIndex * 193 + fold)
        .map((position) => x[test[position]][featureIndex]);
      test.forEach((index, position) => {
        const row = [...x[index]];
        row[featureIndex] = permutedValues[position];
        permutedPredictions[index] = predict(row);
      });
    }
    return { feature, deltaRmse: metrics(y, permutedPredictions).rmse - baseRmse };
  }).sort((a, b) => b.deltaRmse - a.deltaRmse);

  const finalPredictor = fitModel(bestModel, x, y, config, 5003);
  return {
    models,
    bestModel,
    importance,
    predict: (rows) => rows.map(finalPredictor),
  };
}
