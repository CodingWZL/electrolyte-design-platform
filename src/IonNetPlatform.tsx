import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Atom,
  BookOpen,
  ChevronRight,
  Database,
  FlaskConical,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const base = import.meta.env.BASE_URL;

type IonNetView = "home" | "data" | "predict";
type DatasetKind = "experimental" | "computational" | "materials";

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

type PredictionRow = {
  mpId: string;
  parent: string;
  candidate: string;
  pSigma: number;
  uncertainty: number;
};

type DataRow = ExperimentalRow | ComputationalRow | MaterialsRow;

const datasetMeta = {
  experimental: {
    label: "Experimental",
    count: 398,
    file: "experimental.json",
    description: "Room-temperature measurements with family and DOI provenance.",
  },
  computational: {
    label: "Computational",
    count: 8750,
    file: "computational.json",
    description: "Compositions and the published computational SIC target.",
  },
  materials: {
    label: "Materials Project",
    count: 4582,
    file: "materials-project.json",
    description: "Screened Li-containing compounds with stability and band-gap data.",
  },
} as const;

const datasetCache = new Map<DatasetKind, DataRow[]>();
const predictionCache = new Map<number, PredictionRow[]>();

async function loadDataset(kind: DatasetKind) {
  const cached = datasetCache.get(kind);
  if (cached) return cached;
  const response = await fetch(`${base}data/ionnet/${datasetMeta[kind].file}`);
  if (!response.ok) throw new Error(`Dataset request failed (${response.status})`);
  const rows = (await response.json()) as DataRow[];
  datasetCache.set(kind, rows);
  return rows;
}

async function loadPredictionSeries(series: number) {
  const cached = predictionCache.get(series);
  if (cached) return cached;
  const response = await fetch(
    `${base}data/ionnet/predictions-${series}.json.gz`,
  );
  if (!response.ok || !response.body) {
    throw new Error(`Prediction request failed (${response.status})`);
  }
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const rows = (await new Response(stream).json()) as PredictionRow[];
  predictionCache.set(series, rows);
  return rows;
}

function formatScientific(value: number) {
  return value.toExponential(2).replace("e", " × 10^");
}

function IonNetOverview({
  onNavigate,
}: {
  onNavigate: (view: IonNetView) => void;
}) {
  return (
    <>
      <section className="ionnet-hero">
        <div>
          <span className="pill ionnet-pill">
            <Sparkles size={14} /> Descriptor-guided transfer learning for
            solid electrolytes
          </span>
          <h1>
            Decode fast-ion
            <br />
            <em>conductor space.</em>
          </h1>
          <p>
            IonNet connects multimodal composition descriptors, transfer
            learning and substitution screening to navigate solid-state lithium
            conductors at room temperature.
          </p>
          <div className="hero-actions">
            <button className="primary ionnet-primary" onClick={() => onNavigate("predict")}>
              Explore predictions <ChevronRight size={17} />
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
            <small>ensemble prediction</small>
          </div>
        </div>
      </section>
      <section className="metrics ionnet-metrics">
        <div>
          <b>8,750</b>
          <span>computational samples</span>
        </div>
        <div>
          <b>398</b>
          <span>experimental conductors</span>
        </div>
        <div>
          <b>4,582</b>
          <span>Materials Project compounds</span>
        </div>
        <div>
          <b>207,980</b>
          <span>double-substitution predictions</span>
        </div>
      </section>
      <section className="story ionnet-story">
        <div>
          <span className="eyebrow ionnet-eyebrow">WHY IONNET</span>
          <h2>From composition to testable solid-electrolyte candidates.</h2>
        </div>
        <div className="feature-list">
          <article>
            <Database />
            <h3>Search</h3>
            <p>Move across computational, experimental and screening datasets.</p>
          </article>
          <article>
            <FlaskConical />
            <h3>Screen</h3>
            <p>Rank substituted compounds by predicted conductivity and uncertainty.</p>
          </article>
          <article>
            <ShieldCheck />
            <h3>Trace</h3>
            <p>Keep parent compositions, Materials Project IDs and source DOIs visible.</p>
          </article>
        </div>
      </section>
      <a
        className="citation ionnet-citation"
        href="https://doi.org/10.1126/sciadv.aee4959"
        target="_blank"
        rel="noreferrer"
      >
        <BookOpen />
        <div>
          <span className="citation-label">CITE THIS WORK</span>
          <h3>
            Decoding the chemical space of fast-ion conductors via a
            descriptor-guided transfer learning framework
          </h3>
          <p>
            Zhilong Wang & Fengqi You · Science Advances 12, eaee4959 (2026) ·
            doi:10.1126/sciadv.aee4959
          </p>
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

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    loadDataset(kind)
      .then((data) => active && setRows(data))
      .catch((cause) => active && setError(String(cause)))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [kind]);

  const families = useMemo(() => {
    if (kind !== "experimental") return [];
    return Array.from(
      new Set(
        (rows as ExperimentalRow[]).map((row) => row.chemicalFamily).filter(Boolean),
      ),
    ).sort();
  }, [kind, rows]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const text =
        kind === "experimental"
          ? `${(row as ExperimentalRow).formula} ${(row as ExperimentalRow).structureFamily} ${(row as ExperimentalRow).chemicalFamily} ${(row as ExperimentalRow).source}`
          : kind === "computational"
            ? (row as ComputationalRow).formula
            : `${(row as MaterialsRow).mpId} ${(row as MaterialsRow).formula}`;
      const queryMatch = !normalized || text.toLowerCase().includes(normalized);
      const familyMatch =
        kind !== "experimental" ||
        !family ||
        (row as ExperimentalRow).chemicalFamily === family;
      return queryMatch && familyMatch;
    });
  }, [family, kind, query, rows]);

  function chooseKind(next: DatasetKind) {
    setKind(next);
    setQuery("");
    setFamily("");
    onUse();
  }

  return (
    <div className="ionnet-workspace">
      <div className="dataset-tabs" role="tablist" aria-label="IonNet datasets">
        {(Object.keys(datasetMeta) as DatasetKind[]).map((id) => (
          <button
            key={id}
            className={kind === id ? "active" : ""}
            onClick={() => chooseKind(id)}
            role="tab"
            aria-selected={kind === id}
          >
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
          placeholder={
            kind === "materials"
              ? "Search formula or Materials Project ID"
              : "Search formula, family or source DOI"
          }
          aria-label="Search IonNet data"
        />
        {kind === "experimental" && (
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            aria-label="Chemical family"
          >
            <option value="">All chemical families</option>
            {families.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="dataset-summary">
        <p>{datasetMeta[kind].description}</p>
        <strong>
          {busy ? "Loading…" : `${filtered.length.toLocaleString()} matches`}
        </strong>
      </div>
      <div className="ionnet-table-wrap">
        {error ? (
          <p className="dataset-error">{error}</p>
        ) : (
          <table>
            <thead>
              {kind === "experimental" ? (
                <tr>
                  <th>Composition</th>
                  <th>Conductivity (S cm⁻¹)</th>
                  <th>Structure</th>
                  <th>Chemical family</th>
                  <th>Source</th>
                </tr>
              ) : kind === "computational" ? (
                <tr>
                  <th>Composition</th>
                  <th>Computational SIC target</th>
                </tr>
              ) : (
                <tr>
                  <th>MP ID</th>
                  <th>Composition</th>
                  <th>Energy above hull (eV)</th>
                  <th>Band gap (eV)</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((row, index) =>
                kind === "experimental" ? (
                  <tr key={`${(row as ExperimentalRow).id}-${index}`}>
                    <td className="formula-cell">{(row as ExperimentalRow).formula}</td>
                    <td>{formatScientific((row as ExperimentalRow).conductivity)}</td>
                    <td>{(row as ExperimentalRow).structureFamily || "—"}</td>
                    <td>{(row as ExperimentalRow).chemicalFamily}</td>
                    <td>
                      <a
                        href={`https://doi.org/${(row as ExperimentalRow).source}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {(row as ExperimentalRow).source}
                      </a>
                    </td>
                  </tr>
                ) : kind === "computational" ? (
                  <tr key={`${(row as ComputationalRow).formula}-${index}`}>
                    <td className="formula-cell">{(row as ComputationalRow).formula}</td>
                    <td>{(row as ComputationalRow).sic.toFixed(4)}</td>
                  </tr>
                ) : (
                  <tr key={(row as MaterialsRow).mpId}>
                    <td>{(row as MaterialsRow).mpId}</td>
                    <td className="formula-cell">{(row as MaterialsRow).formula}</td>
                    <td>{(row as MaterialsRow).energyAboveHull.toFixed(4)}</td>
                    <td>{(row as MaterialsRow).bandGap.toFixed(3)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
      {filtered.length > 100 && (
        <p className="dataset-limit">
          Showing the first 100 matches. Refine the search to narrow the result set.
        </p>
      )}
    </div>
  );
}

function IonNetPredictionExplorer({ onUse }: { onUse: () => void }) {
  const [series, setSeries] = useState(1);
  const [query, setQuery] = useState("");
  const [maxPSigma, setMaxPSigma] = useState(4);
  const [maxUncertainty, setMaxUncertainty] = useState(2);
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Choose a published candidate set and run the ensemble screen.",
  );

  async function runScreen() {
    setBusy(true);
    setMessage("Loading the published IonNet ensemble predictions…");
    onUse();
    try {
      const data = await loadPredictionSeries(series);
      setRows(data);
      setMessage(
        `Loaded ${data.length.toLocaleString()} model-scored substitutions from candidate set ${series}.`,
      );
    } catch (cause) {
      setMessage(`Prediction data unavailable: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        row.pSigma <= maxPSigma &&
        row.uncertainty <= maxUncertainty &&
        (!normalized ||
          `${row.mpId} ${row.parent} ${row.candidate}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [maxPSigma, maxUncertainty, query, rows]);

  const best = filtered[0];
  return (
    <div className="ionnet-prediction-grid">
      <div className="control-card ionnet-control-card">
        <div className="card-heading">
          <span className="eyebrow ionnet-eyebrow">ENSEMBLE SCREEN</span>
          <h2>Rank substituted conductors</h2>
          <p>
            Query the complete published double-substitution predictions. Lower
            pσ indicates higher predicted ionic conductivity.
          </p>
        </div>
        <div className="fields">
          <label className="field">
            <span>Candidate set</span>
            <select value={series} onChange={(event) => setSeries(+event.target.value)}>
              {[1, 2, 3, 4].map((value) => (
                <option value={value} key={value}>
                  Set {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Formula or MP ID</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Li2BiF5 or mp-760419"
            />
          </label>
          <label className="field">
            <span>Maximum pσ · {maxPSigma.toFixed(1)}</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={maxPSigma}
              onChange={(event) => setMaxPSigma(+event.target.value)}
            />
          </label>
          <label className="field">
            <span>Maximum uncertainty · {maxUncertainty.toFixed(1)}</span>
            <input
              type="range"
              min="0.2"
              max="2"
              step="0.1"
              value={maxUncertainty}
              onChange={(event) => setMaxUncertainty(+event.target.value)}
            />
          </label>
        </div>
        <button className="primary ionnet-primary" onClick={runScreen} disabled={busy}>
          {busy ? "Loading predictions…" : "Run predictive screen"}
          <ChevronRight size={17} />
        </button>
        <p className="prediction-note">{message}</p>
      </div>
      <div className="ionnet-prediction-results">
        <div className="prediction-spotlight">
          <span className="eyebrow ionnet-eyebrow">TOP MATCH</span>
          {best ? (
            <>
              <h3>{best.candidate}</h3>
              <div className="prediction-values">
                <div>
                  <strong>{best.pSigma.toFixed(3)}</strong>
                  <span>predicted pσ</span>
                </div>
                <div>
                  <strong>± {best.uncertainty.toFixed(3)}</strong>
                  <span>ensemble uncertainty</span>
                </div>
              </div>
              <p>
                Approx. σ = {Math.pow(10, -best.pSigma).toExponential(2)} S cm⁻¹ ·
                parent {best.parent} · {best.mpId}
              </p>
            </>
          ) : (
            <div className="empty-prediction">
              <Atom size={34} />
              <p>Run the screen to reveal ranked candidates.</p>
            </div>
          )}
        </div>
        {filtered.length > 0 && (
          <div className="prediction-table ionnet-table-wrap">
            <div className="dataset-summary">
              <p>Ranked by predicted pσ, then uncertainty.</p>
              <strong>{filtered.length.toLocaleString()} matches</strong>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Parent</th>
                  <th>MP ID</th>
                  <th>pσ</th>
                  <th>Uncertainty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((row, index) => (
                  <tr key={`${row.mpId}-${row.candidate}-${index}`}>
                    <td className="formula-cell">{row.candidate}</td>
                    <td>{row.parent}</td>
                    <td>{row.mpId}</td>
                    <td>{row.pSigma.toFixed(3)}</td>
                    <td>{row.uncertainty.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function IonNetPlatform({
  view,
  onNavigate,
  onSearchUse,
  onPredictionUse,
}: {
  view: IonNetView;
  onNavigate: (view: IonNetView) => void;
  onSearchUse: () => void;
  onPredictionUse: () => void;
}) {
  if (view === "home") return <IonNetOverview onNavigate={onNavigate} />;
  return (
    <div className="page ionnet-page">
      <div className="section-title">
        <span className="eyebrow ionnet-eyebrow">
          {view === "data" ? "IONNET DATA" : "IONNET PREDICTIONS"}
        </span>
        <h1>
          {view === "data"
            ? "Search solid-electrolyte evidence."
            : "Screen the substitution space."}
        </h1>
        <p>
          {view === "data"
            ? "Browse every composition released with IonNet across its computational, experimental and Materials Project datasets."
            : "Explore model outputs generated by the published ten-model transfer-learning ensemble, including candidate-level uncertainty."}
        </p>
      </div>
      {view === "data" ? (
        <IonNetDataExplorer onUse={onSearchUse} />
      ) : (
        <IonNetPredictionExplorer onUse={onPredictionUse} />
      )}
    </div>
  );
}
