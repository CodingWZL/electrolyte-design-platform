import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Atom,
  BookOpen,
  ChevronRight,
  Copy,
  Database,
  Download,
  FlaskConical,
  Gauge,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { predictIonNet, type IonNetPrediction } from "./ionnetModel";
import { copyText, downloadCsv } from "./research-utils";

const base = import.meta.env.BASE_URL;

type IonNetView = "home" | "data" | "predict";
type DatasetKind =
  | "experimental"
  | "computational"
  | "materials"
  | "single"
  | "double";
type SortMode =
  | "default"
  | "conductivity-high"
  | "conductivity-low"
  | "sic-high"
  | "stability-high"
  | "bandgap-high"
  | "uncertainty-low";

type ExperimentalRow = {
  id: string;
  formula: string;
  temperature: number;
  conductivity: number;
  logConductivity: number;
  structureFamily: string;
  chemicalFamily: string;
  source: string;
};
type ComputationalRow = { formula: string; sic: number };
type MaterialsRow = {
  mpId: string;
  formula: string;
  energyAboveHull: number;
  bandGap: number;
};
type SingleSubstitutionRow = {
  mpId: string;
  parent: string;
  candidate: string;
  pSigma: number;
  uncertainty: number;
};
type DoubleSubstitutionRow = SingleSubstitutionRow & {
  series: number;
  pSigma: number;
  uncertainty: number;
};
type DataRow =
  | ExperimentalRow
  | ComputationalRow
  | MaterialsRow
  | SingleSubstitutionRow
  | DoubleSubstitutionRow;

const datasetMeta = {
  experimental: {
    label: "Experimental",
    count: 398,
    file: "experimental.json",
    remoteQuery: false,
    description: "Room-temperature measurements with family and DOI provenance.",
  },
  computational: {
    label: "Computational",
    count: 8750,
    file: "computational-preview.json",
    parquet: ["computational.parquet"],
    remoteQuery: true,
    description: "Published computational training compositions and superionic-conductor probability scores.",
  },
  materials: {
    label: "Materials Project",
    count: 4582,
    file: "materials-project-preview.json",
    parquet: ["materials-project.parquet"],
    remoteQuery: true,
    description: "Screened Li-containing compounds with stability and band-gap data.",
  },
  single: {
    label: "Single substitution",
    count: 624460,
    file: "single-substitution-preview.json",
    parquet: ["single-substitution.parquet"],
    remoteQuery: true,
    description: "All released model-scored single-element substitutions.",
  },
  double: {
    label: "Double substitution",
    count: 4316850,
    file: "double-substitution-preview.json",
    parquet: [
      "double-substitution-1.parquet",
      "double-substitution-2.parquet",
      "double-substitution-3.parquet",
      "double-substitution-4.parquet",
    ],
    remoteQuery: true,
    description: "Model-scored double substitutions from the four published sets.",
  },
} as const;

const sortOptions: Record<DatasetKind, { value: SortMode; label: string }[]> = {
  experimental: [
    { value: "default", label: "Published order" },
    { value: "conductivity-high", label: "Highest conductivity" },
    { value: "conductivity-low", label: "Lowest conductivity" },
  ],
  computational: [
    { value: "default", label: "Published order" },
    { value: "sic-high", label: "Highest SIC probability" },
  ],
  materials: [
    { value: "default", label: "Published order" },
    { value: "stability-high", label: "Lowest energy above hull" },
    { value: "bandgap-high", label: "Largest band gap" },
  ],
  single: [
    { value: "default", label: "Published order" },
    { value: "conductivity-high", label: "Highest predicted conductivity" },
    { value: "uncertainty-low", label: "Lowest uncertainty" },
  ],
  double: [
    { value: "default", label: "Published order" },
    { value: "conductivity-high", label: "Highest predicted conductivity" },
    { value: "uncertainty-low", label: "Lowest uncertainty" },
  ],
};

const datasetCache = new Map<DatasetKind, DataRow[]>();
let ionnetConnection: Promise<any> | undefined;

async function loadDataset(kind: DatasetKind) {
  const cached = datasetCache.get(kind);
  if (cached) return cached;
  const response = await fetch(`${base}data/ionnet/${datasetMeta[kind].file}`);
  if (!response.ok) throw new Error(`Dataset request failed (${response.status})`);
  const rows = (await response.json()) as DataRow[];
  datasetCache.set(kind, rows);
  return rows;
}

async function getIonNetConnection() {
  ionnetConnection ??= (async () => {
    const duckdb = await import("@duckdb/duckdb-wasm");
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(
      new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
      worker,
    );
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db.connect();
  })();
  return ionnetConnection;
}

async function queryLargeDataset(kind: DatasetKind, query: string, sort: SortMode) {
  const meta = datasetMeta[kind];
  if (!("parquet" in meta)) throw new Error("This dataset is searched locally.");
  const connection = await getIonNetConnection();
  const urls = meta.parquet.map(
    (file) => `${location.origin}${base}data/ionnet/${file}`,
  );
  const source = urls.length === 1
    ? `'${urls[0]}'`
    : `[${urls.map((url) => `'${url}'`).join(",")}]`;
  const escaped = query.trim().toLowerCase().replace(/'/g, "''");
  const searchable =
    kind === "computational" ? "formula"
      : kind === "materials" ? "concat_ws(' ', mpId, formula)"
        : kind === "single" ? "concat_ws(' ', mpId, parent, candidate)"
          : "concat_ws(' ', CAST(series AS VARCHAR), mpId, parent, candidate)";
  const where = escaped ? `WHERE lower(${searchable}) LIKE '%${escaped}%'` : "";
  const orderBy =
    sort === "sic-high" ? "ORDER BY sic DESC"
      : sort === "stability-high" ? "ORDER BY energyAboveHull ASC"
        : sort === "bandgap-high" ? "ORDER BY bandGap DESC"
          : sort === "conductivity-high" ? "ORDER BY pSigma ASC"
            : sort === "uncertainty-low" ? "ORDER BY uncertainty ASC"
              : "";
  const table = await connection.query(
    `SELECT *, COUNT(*) OVER() AS total_matches FROM read_parquet(${source}) ${where} ${orderBy} LIMIT 100`,
  );
  const values = table.toArray().map((row: any) => row.toJSON());
  return {
    rows: values as DataRow[],
    total: values.length ? Number(values[0].total_matches) : 0,
  };
}

function formatScientific(value: number) {
  return value.toExponential(2).replace("e", " × 10^");
}

function normalizeFormula(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function MaterialsProjectLink({ id }: { id: string }) {
  return (
    <a
      href={`https://materialsproject.org/materials/${encodeURIComponent(id)}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${id} in Materials Project`}
    >
      {id} <ArrowUpRight size={11} />
    </a>
  );
}

function IonNetOverview({ onNavigate }: { onNavigate: (view: IonNetView) => void }) {
  return (
    <>
      <section className="ionnet-hero">
        <div>
          <span className="pill ionnet-pill">
            <Sparkles size={14} /> Descriptor-guided transfer learning for solid electrolytes
          </span>
          <h1>
            Decode fast-ion
            <br />
            <em>conductor space.</em>
          </h1>
          <p>
            IonNet turns a chemical formula into a room-temperature ionic-conductivity
            prediction using the published ten-model transfer-learning ensemble.
          </p>
          <div className="hero-actions">
            <button className="primary ionnet-primary" onClick={() => onNavigate("predict")}>
              Predict a formula <ChevronRight size={17} />
            </button>
            <button className="secondary" onClick={() => onNavigate("data")}>
              Search the data
            </button>
          </div>
        </div>
        <div className="ionnet-model-visual" aria-hidden="true">
          <div className="descriptor-stack">
            <span>Meredig · 120</span>
            <span>Magpie · 132</span>
            <span>MEGNet · 80</span>
          </div>
          <div className="model-node">
            <Atom size={34} />
            <b>IonNet</b>
            <small>10-model ensemble</small>
          </div>
        </div>
      </section>
      <section className="metrics ionnet-metrics">
        <div><b>8,750</b><span>computational samples</span></div>
        <div><b>398</b><span>experimental conductors</span></div>
        <div><b>4,582</b><span>Materials Project compounds</span></div>
        <div><b>624,460</b><span>single substitutions</span></div>
        <div><b>4,316,850</b><span>double substitutions</span></div>
      </section>
      <section className="story ionnet-story">
        <div>
          <span className="eyebrow ionnet-eyebrow">WHY IONNET</span>
          <h2>From composition to a conductivity estimate with uncertainty.</h2>
        </div>
        <div className="feature-list">
          <article><Database /><h3>Search</h3><p>Move across evidence and both substitution spaces without loading every row.</p></article>
          <article><Gauge /><h3>Predict</h3><p>Generate descriptors from a formula and run all ten published models.</p></article>
          <article><ShieldCheck /><h3>Quantify</h3><p>Report log₁₀ conductivity, physical conductivity and ensemble uncertainty.</p></article>
        </div>
      </section>
      <a className="citation ionnet-citation" href="https://doi.org/10.1126/sciadv.aee4959" target="_blank" rel="noreferrer">
        <BookOpen />
        <div>
          <span className="citation-label">SCIENCE ADVANCES · 2026</span>
          <h3>Decoding the chemical space of fast-ion conductors via a descriptor-guided transfer learning framework</h3>
          <p>Zhilong Wang & Fengqi You · Science Advances 12, eaee4959 (2026) · doi:10.1126/sciadv.aee4959</p>
        </div>
        <ArrowUpRight />
      </a>
    </>
  );
}

function IonNetDataExplorer({ onUse }: { onUse: () => void }) {
  const [kind, setKind] = useState<DatasetKind>("experimental");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState<number>(datasetMeta.experimental.count);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState<SortMode>("default");

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setSearched(false);
    setTotal(datasetMeta[kind].count);
    loadDataset(kind)
      .then((data) => active && setRows(data))
      .catch((cause) => active && setError(String(cause)))
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [kind]);

  const families = useMemo(() => {
    if (kind !== "experimental") return [];
    return Array.from(new Set((rows as ExperimentalRow[]).map((row) => row.chemicalFamily).filter(Boolean))).sort();
  }, [kind, rows]);

  const filtered = useMemo(() => {
    const matches = datasetMeta[kind].remoteQuery ? rows : rows.filter((row) => {
      const normalized = query.trim().toLowerCase();
      const text = kind === "experimental"
        ? `${(row as ExperimentalRow).formula} ${(row as ExperimentalRow).structureFamily} ${(row as ExperimentalRow).chemicalFamily} ${(row as ExperimentalRow).source}`
        : `${(row as MaterialsRow).mpId} ${(row as MaterialsRow).formula}`;
      return (!normalized || text.toLowerCase().includes(normalized)) &&
        (kind !== "experimental" || !family || (row as ExperimentalRow).chemicalFamily === family);
    });
    const sorted = [...matches];
    sorted.sort((a, b) => {
      if (sort === "conductivity-high") {
        if (kind === "experimental") return (b as ExperimentalRow).conductivity - (a as ExperimentalRow).conductivity;
        return Number((a as SingleSubstitutionRow).pSigma) - Number((b as SingleSubstitutionRow).pSigma);
      }
      if (sort === "conductivity-low" && kind === "experimental") {
        return (a as ExperimentalRow).conductivity - (b as ExperimentalRow).conductivity;
      }
      if (sort === "sic-high") return Number((b as ComputationalRow).sic) - Number((a as ComputationalRow).sic);
      if (sort === "stability-high") return Number((a as MaterialsRow).energyAboveHull) - Number((b as MaterialsRow).energyAboveHull);
      if (sort === "bandgap-high") return Number((b as MaterialsRow).bandGap) - Number((a as MaterialsRow).bandGap);
      if (sort === "uncertainty-low") return Number((a as SingleSubstitutionRow).uncertainty) - Number((b as SingleSubstitutionRow).uncertainty);
      return 0;
    });
    return sorted;
  }, [family, kind, query, rows, sort]);

  async function runSearch() {
    if (!datasetMeta[kind].remoteQuery) {
      onUse();
      return;
    }
    setBusy(true);
    setError("");
    onUse();
    try {
      const result = await queryLargeDataset(kind, query, sort);
      setRows(result.rows);
      setTotal(result.total);
      setSearched(true);
    } catch (cause) {
      setError(`Search unavailable: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  function chooseKind(next: DatasetKind) {
    if (next === kind) return;
    setRows([]);
    setBusy(true);
    setError("");
    setSearched(false);
    setTotal(datasetMeta[next].count);
    setQuery("");
    setFamily("");
    setSort("default");
    setKind(next);
    onUse();
  }

  function chooseSort(next: SortMode) {
    setSort(next);
    if (!datasetMeta[kind].remoteQuery || !searched) return;
    setBusy(true);
    setError("");
    setSearched(false);
    setTotal(datasetMeta[kind].count);
    loadDataset(kind)
      .then(setRows)
      .catch((cause) => setError(String(cause)))
      .finally(() => setBusy(false));
  }

  const visibleRows = filtered.slice(0, 100);
  const shownTotal = datasetMeta[kind].remoteQuery ? total : filtered.length;
  function exportResults() {
    const filename = `ionnet-${kind}-${searched ? "search" : "preview"}.csv`;
    if (kind === "experimental") {
      downloadCsv(filename, [
        { key: "formula", label: "Composition" },
        { key: "temperature", label: "Temperature (°C)" },
        { key: "conductivity", label: "Conductivity (S cm^-1)" },
        { key: "logConductivity", label: "log10 conductivity (S cm^-1)" },
        { key: "structureFamily", label: "Structure family" },
        { key: "chemicalFamily", label: "Chemical family" },
        { key: "source", label: "Source DOI" },
      ], visibleRows as unknown as Record<string, unknown>[]);
      return;
    }
    if (kind === "computational") {
      downloadCsv(filename, [
        { key: "formula", label: "Composition" },
        { key: "sic", label: "Superionic-conductor probability" },
      ], visibleRows as unknown as Record<string, unknown>[]);
      return;
    }
    if (kind === "materials") {
      downloadCsv(filename, [
        { key: "mpId", label: "Materials Project ID" },
        { key: "formula", label: "Composition" },
        { key: "energyAboveHull", label: "Energy above hull (eV/atom)" },
        { key: "bandGap", label: "Band gap (eV)" },
      ], visibleRows as unknown as Record<string, unknown>[]);
      return;
    }
    const columns = [
      ...(kind === "double" ? [{ key: "series", label: "Published set" }] : []),
      { key: "mpId", label: "Materials Project ID" },
      { key: "parent", label: "Parent composition" },
      { key: "candidate", label: `${kind === "single" ? "Single" : "Double"}-substitution candidate` },
      { key: "pSigma", label: "p-sigma" },
      { key: "logConductivity", label: "log10 conductivity (S cm^-1)" },
      { key: "uncertainty", label: "Model uncertainty" },
    ];
    downloadCsv(filename, columns, visibleRows.map((row) => {
      const item = row as SingleSubstitutionRow & { series?: number };
      return { ...item, logConductivity: -Number(item.pSigma) };
    }));
  }
  return (
    <div className="ionnet-workspace">
      <div className="dataset-tabs ionnet-dataset-tabs" role="tablist" aria-label="IonNet datasets">
        {(Object.keys(datasetMeta) as DatasetKind[]).map((id) => (
          <button key={id} className={kind === id ? "active" : ""} onClick={() => chooseKind(id)} role="tab" aria-selected={kind === id}>
            <span>{datasetMeta[id].label}</span>
            <strong>{datasetMeta[id].count.toLocaleString()}</strong>
          </button>
        ))}
      </div>
      <div className="ionnet-searchbar">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void runSearch()}
          placeholder={kind === "experimental" ? "Search formula, family or source DOI" : "Search formula or Materials Project ID"}
          aria-label="Search IonNet data"
        />
        {kind === "experimental" && (
          <select value={family} onChange={(event) => setFamily(event.target.value)} aria-label="Chemical family">
            <option value="">All chemical families</option>
            {families.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        )}
        <select value={sort} onChange={(event) => chooseSort(event.target.value as SortMode)} aria-label="Sort IonNet results">
          {sortOptions[kind].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        {datasetMeta[kind].remoteQuery && (
          <button className="primary ionnet-query-button" onClick={() => void runSearch()} disabled={busy}>
            {busy ? "Searching…" : "Search all records"}
          </button>
        )}
      </div>
      <div className="dataset-summary">
        <p>{datasetMeta[kind].description}</p>
        <div className="dataset-summary-actions">
          <strong aria-live="polite">
            {busy ? "Loading…" : datasetMeta[kind].remoteQuery && !searched
              ? `Previewing 100 of ${datasetMeta[kind].count.toLocaleString()}`
              : `${shownTotal.toLocaleString()} matches · showing ${visibleRows.length}`}
          </strong>
          {!busy && visibleRows.length > 0 && (
            <button className="result-action" onClick={exportResults}>
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>
      {kind === "computational" && (
        <div className="dataset-definition-note">
          <b>About the SIC score</b>
          <span>
            This value is the predicted probability that a composition is a
            superionic conductor. Scores closer to 1 indicate higher model confidence.
          </span>
        </div>
      )}
      <div className="ionnet-table-wrap">
        {error ? <p className="dataset-error">{error}</p> : (
          <table>
            <thead>
              {kind === "experimental" ? <tr><th>Composition</th><th>Temperature (°C)</th><th>Conductivity (S cm⁻¹)</th><th>log₁₀ σ</th><th>Structure</th><th>Chemical family</th><th>Source</th></tr>
                : kind === "computational" ? <tr><th>Composition</th><th>Computational SIC target</th></tr>
                  : kind === "materials" ? <tr><th>MP ID</th><th>Composition</th><th>Energy above hull (eV)</th><th>Band gap (eV)</th></tr>
                    : kind === "single" ? <tr><th>MP ID</th><th>Parent</th><th>Single-substitution candidate</th><th>pσ</th><th>log₁₀ σ</th><th>Uncertainty</th></tr>
                      : <tr><th>Set</th><th>MP ID</th><th>Parent</th><th>Double-substitution candidate</th><th>pσ</th><th>log₁₀ σ</th><th>Uncertainty</th></tr>}
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                if (kind === "experimental") {
                  const item = row as ExperimentalRow;
                  return <tr key={`${item.id}-${index}`}><td className="formula-cell">{item.formula}</td><td>{Number(item.temperature).toFixed(1)}</td><td>{formatScientific(item.conductivity)}</td><td>{Number(item.logConductivity).toFixed(3)}</td><td>{item.structureFamily || "—"}</td><td>{item.chemicalFamily}</td><td>{item.source ? <a href={`https://doi.org/${item.source}`} target="_blank" rel="noreferrer">{item.source}</a> : "—"}</td></tr>;
                }
                if (kind === "computational") {
                  const item = row as ComputationalRow;
                  return <tr key={`${item.formula}-${index}`}><td className="formula-cell">{item.formula}</td><td>{Number(item.sic).toFixed(4)}</td></tr>;
                }
                if (kind === "materials") {
                  const item = row as MaterialsRow;
                  return <tr key={item.mpId}><td><MaterialsProjectLink id={item.mpId} /></td><td className="formula-cell">{item.formula}</td><td>{item.energyAboveHull.toFixed(4)}</td><td>{item.bandGap.toFixed(3)}</td></tr>;
                }
                if (kind === "single") {
                  const item = row as SingleSubstitutionRow;
                  return <tr key={`${item.mpId}-${item.candidate}-${index}`}><td><MaterialsProjectLink id={item.mpId} /></td><td className="formula-cell">{item.parent}</td><td className="formula-cell">{item.candidate}</td><td>{Number(item.pSigma).toFixed(3)}</td><td>{(-Number(item.pSigma)).toFixed(3)}</td><td>{Number(item.uncertainty).toFixed(3)}</td></tr>;
                }
                const item = row as DoubleSubstitutionRow;
                return <tr key={`${item.series}-${item.mpId}-${item.candidate}-${index}`}><td>{item.series}</td><td><MaterialsProjectLink id={item.mpId} /></td><td className="formula-cell">{item.parent}</td><td className="formula-cell">{item.candidate}</td><td>{Number(item.pSigma).toFixed(3)}</td><td>{(-Number(item.pSigma)).toFixed(3)}</td><td>{Number(item.uncertainty).toFixed(3)}</td></tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="dataset-limit">The initial 100-row preview is a fixed random sample. Preview sorting applies to those 100 rows; choose a ranking and select “Search all records” to rank the complete dataset. Full searches still render at most 100 results and can be exported as CSV.</p>
    </div>
  );
}

function IonNetModelPrediction({ onUse }: { onUse: () => void }) {
  const [formula, setFormula] = useState("Li10GeP2S12");
  const [result, setResult] = useState<IonNetPrediction>();
  const [experimentalMatches, setExperimentalMatches] = useState<ExperimentalRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Enter a composition using standard chemical-formula notation.");

  async function runPrediction() {
    setBusy(true);
    setExperimentalMatches([]);
    setMessage("Generating 332 composition descriptors and running ten IonNet models…");
    onUse();
    try {
      const prediction = await predictIonNet(formula);
      setResult(prediction);
      try {
        const evidence = (await loadDataset("experimental")) as ExperimentalRow[];
        const normalized = normalizeFormula(prediction.formula);
        setExperimentalMatches(
          evidence.filter((row) => normalizeFormula(row.formula) === normalized).slice(0, 5),
        );
      } catch {
        setExperimentalMatches([]);
      }
      setMessage("Prediction completed locally with the published fine-tuned ensemble.");
    } catch (cause) {
      setResult(undefined);
      setMessage(`Unable to predict: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyPrediction() {
    if (!result) return;
    const lower = 10 ** result.lowerLogConductivity;
    const upper = 10 ** result.upperLogConductivity;
    await copyText([
      "IonNet room-temperature ionic-conductivity prediction",
      `Composition: ${result.formula}`,
      `log10(sigma / S cm^-1): ${result.logConductivity.toFixed(3)}`,
      `Conductivity: ${result.conductivity.toExponential(3)} S cm^-1 (${(result.conductivity * 1000).toExponential(3)} mS cm^-1)`,
      `Ensemble SD: ${result.uncertainty.toFixed(3)} log10 units`,
      `One-SD interval: ${lower.toExponential(3)} to ${upper.toExponential(3)} S cm^-1`,
      "Model: IonNet ten-model transfer-learning ensemble",
    ].join("\n"));
    setMessage("Prediction copied with units and uncertainty.");
  }

  function exportPrediction() {
    if (!result) return;
    downloadCsv("ionnet-prediction.csv", [
      { key: "formula", label: "Composition" },
      { key: "logConductivity", label: "log10 conductivity (S cm^-1)" },
      { key: "conductivity", label: "Conductivity (S cm^-1)" },
      { key: "conductivityMilli", label: "Conductivity (mS cm^-1)" },
      { key: "uncertainty", label: "Ensemble SD (log10 units)" },
      { key: "lower", label: "One-SD lower bound (S cm^-1)" },
      { key: "upper", label: "One-SD upper bound (S cm^-1)" },
      { key: "pSigma", label: "Model-native p-sigma" },
    ], [{
      formula: result.formula,
      logConductivity: result.logConductivity,
      conductivity: result.conductivity,
      conductivityMilli: result.conductivity * 1000,
      uncertainty: result.uncertainty,
      lower: 10 ** result.lowerLogConductivity,
      upper: 10 ** result.upperLogConductivity,
      pSigma: result.pSigma,
    }]);
  }

  return (
    <div className="ionnet-prediction-grid model-prediction-grid">
      <div className="control-card ionnet-control-card">
        <div className="card-heading">
          <span className="eyebrow ionnet-eyebrow">LIVE IONNET ENSEMBLE</span>
          <h2>Predict from a chemical formula</h2>
          <p>IonNet uses Meredig, Magpie and MEGNet composition descriptors. Candidate-set membership is not required.</p>
        </div>
        <label className="formula-input-label">
          <span>Chemical formula</span>
          <input value={formula} onChange={(event) => setFormula(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runPrediction()} placeholder="e.g. Li10GeP2S12" autoComplete="off" />
        </label>
        <div className="formula-examples" aria-label="Example solid-electrolyte formulas">
          <span>Try a known family</span>
          <div>
            {[
              ["Li10GeP2S12", "LGPS"],
              ["Li7La3Zr2O12", "Garnet"],
              ["Li6PS5Cl", "Argyrodite"],
              ["Li3YCl6", "Halide"],
            ].map(([value, label]) => (
              <button key={value} onClick={() => { setFormula(value); setResult(undefined); setExperimentalMatches([]); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="primary ionnet-primary" onClick={() => void runPrediction()} disabled={busy}>
          {busy ? "Running IonNet…" : "Predict ionic conductivity"}<ChevronRight size={17} />
        </button>
        <p className="prediction-note">{message}</p>
        <div className="target-definition">
          <b>Output convention</b>
          <span>Model-native pσ = −log₁₀(σ / S·cm⁻¹). This page reports log₁₀ σ by reversing the sign.</span>
        </div>
        <div className="scientific-note ionnet-scope-note">
          <b>Use as a screening result</b>
          <span>IonNet is composition-based. It does not encode synthesis route, phase purity, density, grain boundaries, humidity exposure or measurement protocol. Experimental validation remains essential.</span>
        </div>
      </div>
      <div className="ionnet-prediction-results">
        <div className="prediction-spotlight model-spotlight">
          <span className="eyebrow ionnet-eyebrow">ROOM-TEMPERATURE PREDICTION</span>
          {result ? (
            <>
              <h3>{result.formula}</h3>
              <div className="model-primary-result">
                <strong>{result.logConductivity.toFixed(3)}</strong>
                <span>log₁₀(σ / S·cm⁻¹)</span>
              </div>
              <div className="prediction-values model-values">
                <div><strong>{result.conductivity.toExponential(2)}</strong><span>σ · S cm⁻¹</span></div>
                <div><strong>{(result.conductivity * 1000).toExponential(2)}</strong><span>σ · mS cm⁻¹</span></div>
                <div><strong>± {result.uncertainty.toFixed(3)}</strong><span>ensemble SD · log₁₀ units</span></div>
                <div><strong>{result.pSigma.toFixed(3)}</strong><span>model-native pσ</span></div>
              </div>
              <p>One-standard-deviation interval: {result.lowerLogConductivity.toFixed(3)} to {result.upperLogConductivity.toFixed(3)} log₁₀(S cm⁻¹), equivalent to {(10 ** result.lowerLogConductivity).toExponential(2)}–{(10 ** result.upperLogConductivity).toExponential(2)} S cm⁻¹.</p>
              <div className="ensemble-strip" aria-label="Individual model predictions">
                {result.ensemble.map((value, index) => <span key={index}>M{index + 1} {value.toFixed(2)}</span>)}
              </div>
              <div className="prediction-actions">
                <button className="result-action" onClick={() => void copyPrediction()}><Copy size={14} /> Copy result</button>
                <button className="result-action" onClick={exportPrediction}><Download size={14} /> Export CSV</button>
              </div>
            </>
          ) : (
            <div className="empty-prediction"><Atom size={34} /><p>Submit a formula to run the ten-model ensemble.</p></div>
          )}
        </div>
        {result && (
          <div className="experimental-check">
            <div>
              <b>Experimental cross-check</b>
              <span>{experimentalMatches.length ? `${experimentalMatches.length} exact composition record${experimentalMatches.length === 1 ? "" : "s"} found in the released dataset.` : "No exact composition string was found in the released experimental dataset."}</span>
            </div>
            {experimentalMatches.map((item, index) => (
              <article key={`${item.id}-${index}`}>
                <strong>{formatScientific(item.conductivity)} S cm⁻¹</strong>
                <span>{item.temperature.toFixed(1)} °C · {item.structureFamily || item.chemicalFamily}</span>
                {item.source && <a href={`https://doi.org/${item.source}`} target="_blank" rel="noreferrer">Source <ArrowUpRight size={11} /></a>}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function IonNetPlatform({ view, onNavigate, onSearchUse, onPredictionUse }: {
  view: IonNetView;
  onNavigate: (view: IonNetView) => void;
  onSearchUse: () => void;
  onPredictionUse: () => void;
}) {
  if (view === "home") return <IonNetOverview onNavigate={onNavigate} />;
  return (
    <div className="page ionnet-page">
      <div className="section-title">
        <span className="eyebrow ionnet-eyebrow">{view === "data" ? "IONNET DATA" : "IONNET MODEL"}</span>
        <h1>{view === "data" ? "Search solid-electrolyte evidence." : "Predict ionic conductivity."}</h1>
        <p>{view === "data"
          ? "Browse the training, screening, single-substitution and double-substitution data released with IonNet."
          : "Enter any supported chemical composition to run the published transfer-learning ensemble and quantify model disagreement."}</p>
      </div>
      {view === "data" ? <IonNetDataExplorer onUse={onSearchUse} /> : <IonNetModelPrediction onUse={onPredictionUse} />}
    </div>
  );
}
