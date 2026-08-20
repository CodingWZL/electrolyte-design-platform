import { useMemo, useState } from "react";
import { BrainCircuit, Download, ScatterChart, TableProperties, Upload } from "lucide-react";
import { downloadText, paretoFront, parseDelimited, toCsv } from "./math";
import { benchmarkRegression, type BenchmarkConfig, type BenchmarkResult } from "./ml";
import type { FeatureUses, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseRecords(text: string) {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function tableHeaders(text: string) {
  return parseDelimited(text)[0]?.map(normalizeHeader).filter(Boolean) ?? [];
}

function numericHeaders(text: string) {
  const rows = parseRecords(text);
  if (!rows.length) return [];
  return Object.keys(rows[0]).filter((header) => {
    const populated = rows.map((row) => row[header]).filter((value) => value !== "");
    return populated.length > 0 && populated.filter((value) => Number.isFinite(Number(value))).length / populated.length >= 0.9;
  });
}

const demoDataset = (() => {
  const rows = ["concentration_m,temperature_k,donor_number,dielectric_constant,viscosity_mpas,conductivity_ms_cm"];
  for (let index = 0; index < 42; index += 1) {
    const concentration = 0.4 + (index % 7) * 0.2;
    const temperature = 278 + (index % 8) * 7;
    const donor = 14 + (index % 6) * 3.4;
    const dielectric = 22 + (index % 9) * 7.5;
    const viscosity = 1.6 + (index % 10) * 0.62;
    const conductivity = Math.max(0.15, 1.2 + 3.4 * concentration + 0.052 * (temperature - 278) + 0.065 * donor + 0.012 * dielectric - 0.72 * viscosity - 1.35 * (concentration - 1.15) ** 2 + 0.18 * Math.sin(index * 1.7));
    rows.push([concentration, temperature, donor, dielectric, viscosity, conductivity.toFixed(4)].join(","));
  }
  return rows.join("\n");
})();

function DatasetHarmonizer({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState("salt,solvent,concentration_m,temperature_k,conductivity_ms_cm\nLiPF6,EC:DMC,1.0,298.15,10.2\nLiPF6,EC:DMC,1.0,298.15,10.2\nLiFSI,DME,1.5,,12.8");
  const [result, setResult] = useState<{ rows: Record<string,string>[]; duplicates: number; missing: number }>();
  const analyze = () => {
    const rows = parseRecords(text); if (!rows.length) return;
    const seen = new Set<string>(); let duplicates = 0; let missing = 0;
    const unique = rows.filter((row) => { const key = JSON.stringify(row); if (seen.has(key)) { duplicates += 1; return false; } seen.add(key); missing += Object.values(row).filter((value) => !value).length; return true; });
    setResult({ rows: unique, duplicates, missing }); onUse("dataset_harmonize");
  };
  const exportRows = () => { if (!result?.rows.length) return; const headers = Object.keys(result.rows[0]); downloadText("harmonized-electrolytes.csv", toCsv([headers, ...result.rows.map((row)=>headers.map((key)=>row[key]))]), "text/csv"); };
  return <article className="tool-card"><div className="tool-heading"><div><span className="tool-kicker"><TableProperties size={15}/> Data quality</span><h3>Dataset harmonizer</h3><p>Normalize headers, audit missing values and remove exact duplicate rows without uploading data.</p></div><UsageBadge count={usage?.dataset_harmonize}/></div><label>CSV / TSV<textarea rows={9} value={text} onChange={(e)=>setText(e.target.value)} /></label><div className="button-row"><button className="primary-button" onClick={analyze}>Audit dataset</button>{result && <button className="secondary-button" onClick={exportRows}><Download size={15}/> Export clean CSV</button>}</div>{result && <div className="result-grid"><span><small>Unique rows</small><strong>{result.rows.length}</strong></span><span><small>Exact duplicates</small><strong>{result.duplicates}</strong></span><span><small>Missing cells</small><strong>{result.missing}</strong></span></div>}<p className="method-note">Header normalization does not infer units or chemical identity. Retain provenance and verify unit conversions before combining sources.</p></article>;
}

function ParetoExplorer({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState("name,conductivity,viscosity,cost\nA,11.2,3.1,8\nB,9.5,2.2,5\nC,13.0,5.6,12\nD,8.1,2.5,4\nE,10.8,3.0,6");
  const [objectives, setObjectives] = useState("conductivity:max,viscosity:min,cost:min");
  const [front, setFront] = useState<Record<string,string>[]>();
  const analyze = () => {
    const rows = parseRecords(text);
    const parsed = objectives.split(",").map((entry) => { const [key, direction] = entry.trim().split(":"); return { key, direction } as {key:string;direction:"min"|"max"}; }).filter((entry)=>entry.key && ["min","max"].includes(entry.direction));
    if (!rows.length || !parsed.length) return; setFront(paretoFront(rows, parsed)); onUse("pareto_analyze");
  };
  const exportFront = () => { if (!front?.length) return; const headers = Object.keys(front[0]); downloadText("pareto-front.csv",toCsv([headers,...front.map((row)=>headers.map((key)=>row[key]))]),"text/csv"); };
  return <article className="tool-card"><div className="tool-heading"><div><span className="tool-kicker"><ScatterChart size={15}/> Multi-objective</span><h3>Pareto explorer</h3><p>Find non-dominated electrolyte candidates across any numeric objectives.</p></div><UsageBadge count={usage?.pareto_analyze}/></div><label>CSV / TSV<textarea rows={8} value={text} onChange={(e)=>setText(e.target.value)} /></label><label>Objectives (column:min/max)<input value={objectives} onChange={(e)=>setObjectives(e.target.value)} /></label><div className="button-row"><button className="primary-button" onClick={analyze}>Find Pareto front</button>{front && <button className="secondary-button" onClick={exportFront}><Download size={15}/> Export front</button>}</div>{front && <><div className="result-callout"><small>Non-dominated candidates</small><strong>{front.length}</strong></div><div className="chip-list">{front.map((row,index)=><span key={index}>{row.name || `Row ${index+1}`}</span>)}</div></>}<p className="method-note">Pareto membership describes the supplied objectives only; it is not a performance prediction or a safety assessment.</p></article>;
}

type MlRun = { benchmark: BenchmarkResult; records: Record<string, string>[]; observed: number[]; features: string[]; target: string; excluded: number };

function MachineLearningWorkbench({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState(demoDataset);
  const [target, setTarget] = useState("conductivity_ms_cm");
  const [features, setFeatures] = useState(["concentration_m", "temperature_k", "donor_number", "dielectric_constant", "viscosity_mpas"]);
  const [config, setConfig] = useState<BenchmarkConfig>({ folds: 5, seed: 42, ridgeLambda: 1, knnK: 5, forestTrees: 24, forestDepth: 6 });
  const [run, setRun] = useState<MlRun>();
  const [message, setMessage] = useState("The built-in dataset is synthetic and exists only to demonstrate the workflow.");
  const [newText, setNewText] = useState("concentration_m,temperature_k,donor_number,dielectric_constant,viscosity_mpas\n1.0,298.15,20.0,60.0,3.5\n1.4,313.15,24.0,45.0,4.2");
  const [newPredictions, setNewPredictions] = useState<Record<string, string | number>[]>();
  const headers = useMemo(() => tableHeaders(text), [text]);

  const autoSelect = (value = text) => {
    const numeric = numericHeaders(value);
    if (numeric.length < 2) { setMessage("At least two mostly numeric columns are required."); return; }
    const nextTarget = numeric[numeric.length - 1];
    setTarget(nextTarget); setFeatures(numeric.slice(0, -1).slice(0, 25));
    setMessage(`Selected ${numeric.length - 1} numeric features and target “${nextTarget}”.`);
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    const value = await file.text(); setText(value); setRun(undefined); setNewPredictions(undefined); autoSelect(value);
  };

  const runModels = () => {
    try {
      const all = parseRecords(text).slice(0, 2000);
      if (!target || !features.length) throw new Error("Choose one target and at least one feature.");
      const valid = all.filter((row) => [target, ...features].every((key) => Number.isFinite(Number(row[key]))));
      const x = valid.map((row) => features.map((key) => Number(row[key])));
      const y = valid.map((row) => Number(row[target]));
      const benchmark = benchmarkRegression(x, y, features, config);
      setRun({ benchmark, records: valid, observed: y, features, target, excluded: all.length - valid.length });
      setNewPredictions(undefined); setMessage(`Completed ${config.folds}-fold cross-validation on ${valid.length} rows. Best RMSE: ${benchmark.bestModel}.`); onUse("ml_benchmark");
    } catch (cause) { setRun(undefined); setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };

  const exportValidation = () => {
    if (!run) return;
    const columns = ["row", "observed", ...run.benchmark.models.map((model) => `${model.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_cv_prediction`)];
    const rows = run.observed.map((observed, index) => [index + 1, observed, ...run.benchmark.models.map((model) => model.predictions[index])]);
    downloadText("ml-cross-validation-predictions.csv", toCsv([columns, ...rows]), "text/csv");
  };

  const predictNew = () => {
    if (!run) return;
    try {
      const records = parseRecords(newText);
      const valid = records.filter((row) => run.features.every((feature) => Number.isFinite(Number(row[feature]))));
      if (!valid.length) throw new Error("No complete prediction rows match the trained feature columns.");
      const values = run.benchmark.predict(valid.map((row) => run.features.map((feature) => Number(row[feature]))));
      setNewPredictions(valid.map((row, index) => ({ ...row, [`predicted_${run.target}`]: values[index] })));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };

  const exportNew = () => {
    if (!newPredictions?.length) return;
    const columns = Object.keys(newPredictions[0]);
    downloadText("ml-new-sample-predictions.csv", toCsv([columns, ...newPredictions.map((row) => columns.map((column) => row[column]))]), "text/csv");
  };

  const maxImportance = Math.max(1e-12, ...(run?.benchmark.importance.map((item) => Math.max(0, item.deltaRmse)) ?? []));
  return <article className="tool-card tool-card-wide ml-workbench">
    <div className="tool-heading"><div><span className="tool-kicker"><BrainCircuit size={15}/> Browser-native machine learning</span><h3>Regression model workbench</h3><p>Train and compare a mean baseline, ridge regression, distance-weighted kNN and a random forest using leakage-safe cross-validation. Inspect permutation importance, fit the best model on all valid rows and predict new samples.</p></div><UsageBadge count={usage?.ml_benchmark}/></div>
    <div className="ml-data-head"><label className="file-button"><Upload size={15}/> Load CSV / TSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(event) => void loadFile(event.target.files?.[0])}/></label><button className="secondary-button" onClick={() => autoSelect()}>Auto-select numeric columns</button><span>{parseRecords(text).length.toLocaleString()} rows · {headers.length} columns</span></div>
    <label>Training dataset<textarea rows={10} value={text} onChange={(event) => { setText(event.target.value); setRun(undefined); }}/></label>
    <div className="ml-column-layout"><label>Prediction target<select value={target} onChange={(event) => { setTarget(event.target.value); setFeatures((current) => current.filter((feature) => feature !== event.target.value)); }}><option value="">Choose target</option>{headers.map((header) => <option key={header}>{header}</option>)}</select></label><fieldset><legend>Numeric features</legend><div className="ml-feature-list">{headers.filter((header) => header !== target).map((header) => <label key={header}><input type="checkbox" checked={features.includes(header)} onChange={(event) => setFeatures((current) => event.target.checked ? [...current, header] : current.filter((feature) => feature !== header))}/>{header}</label>)}</div></fieldset></div>
    <details className="ml-settings"><summary>Validation and model settings</summary><div className="input-grid"><label>Cross-validation folds<input type="number" min="3" max="10" value={config.folds} onChange={(event) => setConfig({ ...config, folds: Number(event.target.value) })}/></label><label>Random seed<input type="number" value={config.seed} onChange={(event) => setConfig({ ...config, seed: Number(event.target.value) })}/></label><label>Ridge λ<input type="number" min="0.000001" step="0.1" value={config.ridgeLambda} onChange={(event) => setConfig({ ...config, ridgeLambda: Number(event.target.value) })}/></label><label>kNN neighbors<input type="number" min="1" max="50" value={config.knnK} onChange={(event) => setConfig({ ...config, knnK: Number(event.target.value) })}/></label><label>Forest trees<input type="number" min="4" max="100" value={config.forestTrees} onChange={(event) => setConfig({ ...config, forestTrees: Number(event.target.value) })}/></label><label>Forest max depth<input type="number" min="2" max="12" value={config.forestDepth} onChange={(event) => setConfig({ ...config, forestDepth: Number(event.target.value) })}/></label></div></details>
    <div className="button-row"><button className="primary-button" onClick={runModels}>Train & cross-validate models</button>{run && <button className="secondary-button" onClick={exportValidation}><Download size={15}/> Export CV predictions</button>}</div><p className="ml-status" aria-live="polite">{message}</p>
    {run && <><div className="ml-summary"><div><small>Valid / excluded rows</small><strong>{run.records.length} / {run.excluded}</strong></div><div><small>Features</small><strong>{run.features.length}</strong></div><div><small>Selected model</small><strong>{run.benchmark.bestModel}</strong></div></div><div className="ml-results-grid"><div className="ml-model-table"><h4>Out-of-fold performance</h4><table><thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>R²</th></tr></thead><tbody>{run.benchmark.models.map((model) => <tr className={model.name === run.benchmark.bestModel ? "best" : ""} key={model.name}><td>{model.name}</td><td>{model.metrics.mae.toPrecision(4)}</td><td>{model.metrics.rmse.toPrecision(4)}</td><td>{model.metrics.r2.toFixed(4)}</td></tr>)}</tbody></table></div><div className="ml-importance"><h4>Permutation importance</h4>{run.benchmark.importance.map((item) => <div key={item.feature}><span>{item.feature}</span><i><b style={{ width: `${Math.max(2, Math.max(0, item.deltaRmse) / maxImportance * 100)}%` }}/></i><strong>{item.deltaRmse >= 0 ? "+" : ""}{item.deltaRmse.toPrecision(3)} RMSE</strong></div>)}</div></div><div className="ml-new-samples"><h4>Predict new samples with {run.benchmark.bestModel}</h4><p>Use the same feature headers and units as the training table. The selected model is refit on all valid rows before these predictions.</p><label>New samples<textarea rows={6} value={newText} onChange={(event) => setNewText(event.target.value)}/></label><div className="button-row"><button className="primary-button" onClick={predictNew}>Predict new rows</button>{newPredictions && <button className="secondary-button" onClick={exportNew}><Download size={15}/> Export predictions</button>}</div>{newPredictions && <div className="table-scroll"><table><thead><tr>{Object.keys(newPredictions[0]).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{newPredictions.slice(0, 20).map((row, index) => <tr key={index}>{Object.keys(newPredictions[0]).map((column) => <td key={column}>{typeof row[column] === "number" ? Number(row[column]).toPrecision(6) : row[column]}</td>)}</tr>)}</tbody></table></div>}</div></>}
    <p className="method-note">Cross-validation preprocessing is learned from each training fold only. Model selection on the same cross-validation results is still optimistic; reserve an external test set and check chemistry-aware grouping, domain coverage and uncertainty before publication or experimental decisions.</p>
  </article>;
}

export function DataTools({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) { return <div className="advanced-tools"><MachineLearningWorkbench usage={usage} onUse={onUse}/><DatasetHarmonizer usage={usage} onUse={onUse}/><ParetoExplorer usage={usage} onUse={onUse}/></div>; }
