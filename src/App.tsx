import { useEffect, useMemo, useRef, useState } from "react";
import * as ort from "onnxruntime-web";
import {
  Atom,
  BarChart3,
  BookOpen,
  ChevronRight,
  Database,
  FlaskConical,
  Github,
  Layers3,
  Search,
  Sparkles,
} from "lucide-react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

type Catalog = {
  salts: Record<string, number[]>;
  solvents: Record<string, number[]>;
};
type PredictionInputs = {
  salt: string;
  concentration: number;
  concentrationUnit: string;
  solvent1: string;
  ratio1: number;
  solvent2: string;
  solventUnit: string;
  temperature: number;
};
type SearchInputs = {
  salt: string;
  concentration: string;
  concentrationUnit: string;
  solvent1: string;
  ratio1: string;
  solvent2: string;
  solventUnit: string;
  temperature: string;
};
type Result = {
  T: number;
  concentration: number;
  "Li-salt": string;
  "concentration-unit": string;
  "solvent-unit": string;
  solvent_1: string;
  ratio_1: number;
  solvent_2: string;
  ratio_2: number;
  K: number;
  total_matches?: number;
};
type ReachPoint = {
  code: string;
  name: string;
  coordinates: [number, number];
  count: number;
};

const base = import.meta.env.BASE_URL;
const geo = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const counterBase =
  "https://api.counterapi.dev/v1/codingwzl-electrolyte-design";
const counterSeeds: Record<string, number> = {
  "site-visits": 14,
  "country-US": 8,
  "search-uses": 3,
  "prediction-uses": 2,
};
const predictionDefaults: PredictionInputs = {
  salt: "LiPF6",
  concentration: 0.6,
  concentrationUnit: "mol/l",
  solvent1: "EC",
  ratio1: 0.5,
  solvent2: "PC",
  solventUnit: "w",
  temperature: 300,
};
const searchDefaults: SearchInputs = {
  salt: "LiPF6",
  concentration: ".6",
  concentrationUnit: "mol/l",
  solvent1: "EC",
  ratio1: ".5",
  solvent2: "PC",
  solventUnit: "w",
  temperature: "300",
};
const reachRegions: Omit<ReachPoint, "count">[] = [
  { code: "US", name: "United States", coordinates: [-98, 39] },
  { code: "CA", name: "Canada", coordinates: [-106, 56] },
  { code: "BR", name: "Brazil", coordinates: [-52, -10] },
  { code: "GB", name: "United Kingdom", coordinates: [-3, 55] },
  { code: "FR", name: "France", coordinates: [2, 46] },
  { code: "DE", name: "Germany", coordinates: [10, 51] },
  { code: "CN", name: "China", coordinates: [104, 35] },
  { code: "JP", name: "Japan", coordinates: [138, 37] },
  { code: "KR", name: "South Korea", coordinates: [128, 36] },
  { code: "IN", name: "India", coordinates: [79, 22] },
  { code: "SG", name: "Singapore", coordinates: [104, 1] },
  { code: "AU", name: "Australia", coordinates: [134, -25] },
];

const saltFiles: Record<string, string> = {
  LiPF6: "PF6",
  LiBF4: "BF4",
  LiTDI: "TDI",
  LiFSI: "FSI",
  LiTFSI: "TFSI",
  LiPDI: "PDI",
  LiClO4: "ClO4",
  LiAsF6: "AsF6",
  LiBOB: "BOB",
  LiCF3SO3: "CF3SO3",
  LiBPFPB: "BPFPB",
  LiBMB: "BMB",
  "LiN(CF3SO2)2": "NCF3SO2",
};
const solventFiles: Record<string, string> = {
  EC: "EC",
  PC: "PC",
  DMC: "DMC",
  EMC: "EMC",
  DEC: "DEC",
  DME: "DME",
  DMSO: "DMSO",
  AN: "AN",
  MOEMC: "MOEMC",
  TFP: "TFP",
  EA: "EA",
  MA: "MA",
  FEC: "FEC",
  DOL: "DOL",
  "2-MeTHF": "2-Me",
  DMM: "DMM",
  "Freon 11": "Freon",
  MC: "Methy",
  THF: "THF",
  Toluene: "Toluene",
  Sulfolane: "Sulf",
  "2-Glyme": "2-Gly",
  "3-Glyme": "3-Gly",
  "4-Glyme": "4-Gly",
  "3-Me-2-O": "3-me-2-o",
  "3-MeSul": "3-Me",
  Ethyldg: "Ethyld",
  DMF: "DMF",
  Ethylb: "Ethylb",
  Ethylmg: "Ethylm",
  Benzene: "Benzene",
  "g-Buty": "g-But",
  Cumene: "Cumene",
  PropSul: "Propy",
  Pseudo: "Pseu",
  TEOS: "TEOS",
  "m-Xylene": "m-Xylene",
  "o-Xylene": "o-Xylene",
};

function counterName(name: string) {
  const preview =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return `${preview ? "preview-" : ""}${name}`;
}
async function readCounter(name: string) {
  const key = `scan-counter-${counterName(name)}`;
  try {
    const r = await fetch(`${counterBase}/${counterName(name)}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const value = Number(d.count ?? d.value ?? 0);
    localStorage.setItem(key, String(value));
    return value;
  } catch {
    return Number(localStorage.getItem(key) ?? counterSeeds[name] ?? 0);
  }
}
async function bumpCounter(name: string) {
  const r = await fetch(`${counterBase}/${counterName(name)}/up`);
  if (!r.ok) return 0;
  const d = await r.json();
  return Number(d.count ?? d.value ?? 0);
}
function useCounter(name: string) {
  const [count, setCount] = useState(counterSeeds[name] ?? 0);
  useEffect(() => {
    readCounter(name)
      .then(setCount)
      .catch(() => {});
  }, [name]);
  return {
    count,
    bump: async () => {
      setCount((v) => v + 1);
      try {
        setCount(await bumpCounter(name));
      } catch {
        /* keep the optimistic count */
      }
    },
  };
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  );
}
function AnyOption() {
  return <option value="">Any</option>;
}
function UsageCounter({ label, count }: { label: string; count: number }) {
  return (
    <div className="usage-counter">
      <span>{label}</span>
      <strong>{count.toLocaleString()}</strong>
      <small>total uses</small>
    </div>
  );
}

function PredictionPanel({ catalog }: { catalog: Catalog }) {
  const [x, setX] = useState(predictionDefaults);
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState<number>();
  const [message, setMessage] = useState("");
  const usage = useCounter("prediction-uses");
  const ratio2 = +(1 - x.ratio1).toFixed(1);
  const set = <K extends keyof PredictionInputs>(
    k: K,
    v: PredictionInputs[K],
  ) => setX((s) => ({ ...s, [k]: v }));
  async function predict() {
    setBusy(true);
    setMessage("Running the trained dynamic-routing model in your browser…");
    usage.bump();
    try {
      const r1 = catalog.solvents[x.solvent1].map(
        (v, i) => v * x.ratio1 + catalog.solvents[x.solvent2][i] * ratio2,
      );
      const cond = [
        x.temperature / 100,
        x.concentrationUnit === "mol/l" ? 1 : 0,
        ...(x.solventUnit === "mol"
          ? [1, 0, 0]
          : x.solventUnit === "w"
            ? [0, 1, 0]
            : [0, 0, 1]),
        x.concentration,
      ];
      const session = await ort.InferenceSession.create(`${base}scan.onnx`, {
        executionProviders: ["wasm"],
      });
      const out = await session.run({
        salt: new ort.Tensor(
          "float32",
          Float32Array.from(catalog.salts[x.salt]),
          [1, 14],
        ),
        solvent: new ort.Tensor("float32", Float32Array.from(r1), [1, 14]),
        condition: new ort.Tensor("float32", Float32Array.from(cond), [1, 6]),
      });
      setPrediction(Number(out.conductivity.data[0]));
      setMessage("Prediction complete. Inputs never left this device.");
    } catch (e) {
      setMessage(`Prediction unavailable: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tool-grid">
        <div className="control-card">
          <div className="card-heading">
            <span className="eyebrow">FORMULATION</span>
            <h2>Compose an electrolyte</h2>
            <p>Two-solvent systems · ratios always sum to 1.0</p>
          </div>
          <div className="fields">
            <Field label="Lithium salt">
              <Select value={x.salt} onChange={(v) => set("salt", v)}>
                {Object.keys(catalog.salts).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Concentration">
              <div className="split">
                <input
                  type="number"
                  min="0.2"
                  max="2"
                  step="0.2"
                  value={x.concentration}
                  onChange={(e) => set("concentration", +e.target.value)}
                />
                <Select
                  value={x.concentrationUnit}
                  onChange={(v) => set("concentrationUnit", v)}
                >
                  <option>mol/l</option>
                  <option>mol/kg</option>
                </Select>
              </div>
            </Field>
            <Field label="Solvent A">
              <Select value={x.solvent1} onChange={(v) => set("solvent1", v)}>
                {Object.keys(catalog.solvents).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Blend · ${Math.round(x.ratio1 * 100)} / ${Math.round(ratio2 * 100)}`}
            >
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.1"
                value={x.ratio1}
                onChange={(e) => set("ratio1", +e.target.value)}
              />
            </Field>
            <Field label="Solvent B">
              <Select value={x.solvent2} onChange={(v) => set("solvent2", v)}>
                {Object.keys(catalog.solvents).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ratio basis">
              <Select
                value={x.solventUnit}
                onChange={(v) => set("solventUnit", v)}
              >
                <option value="w">Weight</option>
                <option value="v">Volume</option>
                <option value="mol">Molar</option>
              </Select>
            </Field>
            <Field label={`Temperature · ${x.temperature} K`}>
              <input
                type="range"
                min="200"
                max="320"
                step="20"
                value={x.temperature}
                onChange={(e) => set("temperature", +e.target.value)}
              />
            </Field>
          </div>
          <button className="primary" disabled={busy} onClick={predict}>
            {busy ? "Working…" : "Predict conductivity"}{" "}
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="result-card">
          <div className="orb">
            <Atom size={34} />
          </div>
          <span className="eyebrow">PREDICTED CONDUCTIVITY</span>
          <strong className="big-result">
            {prediction === undefined ? "—" : prediction.toFixed(3)}
          </strong>
          <span className="unit">mS cm⁻¹ at {x.temperature} K</span>
          <div className="formula">
            {x.salt} · {x.solvent1}
            <sub>{x.ratio1}</sub> {x.solvent2}
            <sub>{ratio2}</sub>
          </div>
          <p className="status">
            {message || "Set the formulation, then run the model."}
          </p>
        </div>
      </div>
      <UsageCounter label="Conductivity predictions" count={usage.count} />
    </>
  );
}

function SearchPanel({ catalog }: { catalog: Catalog }) {
  const [x, setX] = useState(searchDefaults);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Result[]>([]);
  const [message, setMessage] = useState(
    "Select one or more filters. Unspecified fields match any value.",
  );
  const [total, setTotal] = useState(0);
  const usage = useCounter("search-uses");
  const set = <K extends keyof SearchInputs>(k: K, v: SearchInputs[K]) =>
    setX((s) => ({ ...s, [k]: v }));
  async function search() {
    const selected = Object.values(x).filter(Boolean).length;
    if (!selected) {
      setMessage(
        "Choose at least one component or condition to keep the result set meaningful.",
      );
      return;
    }
    setBusy(true);
    setRows([]);
    setTotal(0);
    setMessage("Querying the optimized conductivity index…");
    usage.bump();
    try {
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const worker = await duckdb.createWorker(bundle.mainWorker!);
      const db = new duckdb.AsyncDuckDB(
        new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING),
        worker,
      );
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const c = await db.connect();
      const esc = (s: string) => s.replace(/'/g, "''");
      const clauses: string[] = [];
      if (x.salt) clauses.push(`\"Li-salt\"='${esc(x.salt)}'`);
      if (x.solvent1) clauses.push(`solvent_1='${esc(x.solvent1)}'`);
      if (x.solvent2) clauses.push(`solvent_2='${esc(x.solvent2)}'`);
      if (x.ratio1) {
        clauses.push(`ratio_1=${Number(x.ratio1)}`);
        clauses.push(`ratio_2=${Number((1 - Number(x.ratio1)).toFixed(1))}`);
      }
      if (x.temperature) clauses.push(`T=${Number(x.temperature) / 100}`);
      if (x.concentration)
        clauses.push(`concentration=${Number(x.concentration)}`);
      if (x.concentrationUnit)
        clauses.push(`\"concentration-unit\"='${esc(x.concentrationUnit)}'`);
      if (x.solventUnit)
        clauses.push(`\"solvent-unit\"='${esc(x.solventUnit)}'`);
      const salts = x.salt ? [x.salt] : Object.keys(catalog.salts);
      const urls = salts.map(
        (s) =>
          `${location.origin}${base}data/atlas/${s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")}.parquet`,
      );
      const source =
        urls.length === 1
          ? `'${urls[0]}'`
          : `[${urls.map((u) => `'${u}'`).join(",")}]`;
      const table = await c.query(
        `SELECT *, COUNT(*) OVER() AS total_matches FROM read_parquet(${source}) WHERE ${clauses.join(" AND ")} LIMIT 100`,
      );
      const found = table.toArray().map((r: any) => r.toJSON()) as Result[];
      const totalFound = found.length ? Number(found[0].total_matches) : 0;
      setRows(found);
      setTotal(totalFound);
      setMessage(
        totalFound
          ? `Found ${totalFound.toLocaleString()} matching formulations. Showing the first ${found.length}.`
          : "No matching formulation found.",
      );
      await c.close();
      await db.terminate();
    } catch (e) {
      setMessage(`Atlas query unavailable: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="search-layout">
        <div className="control-card">
          <div className="card-heading">
            <span className="eyebrow">FLEXIBLE FILTERS</span>
            <h2>Search by what you know</h2>
            <p>Leave fields blank to search across every available value.</p>
          </div>
          <div className="fields">
            <Field label="Lithium salt">
              <Select value={x.salt} onChange={(v) => set("salt", v)}>
                <AnyOption />
                {Object.keys(catalog.salts).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Solvent A">
              <Select value={x.solvent1} onChange={(v) => set("solvent1", v)}>
                <AnyOption />
                {Object.keys(catalog.solvents).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Solvent B">
              <Select value={x.solvent2} onChange={(v) => set("solvent2", v)}>
                <AnyOption />
                {Object.keys(catalog.solvents).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </Select>
            </Field>
            <Field label="Temperature">
              <Select
                value={x.temperature}
                onChange={(v) => set("temperature", v)}
              >
                <AnyOption />
                {[200, 220, 240, 260, 280, 300, 320].map((v) => (
                  <option key={v} value={v}>
                    {v} K
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Concentration">
              <div className="split concentration-split">
                <Select
                  value={x.concentration}
                  onChange={(v) => set("concentration", v)}
                >
                  <AnyOption />
                  {[0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
                <Select
                  value={x.concentrationUnit}
                  onChange={(v) => set("concentrationUnit", v)}
                >
                  <AnyOption />
                  <option>mol/l</option>
                  <option>mol/kg</option>
                </Select>
              </div>
            </Field>
            <Field label="Solvent A ratio">
              <Select value={x.ratio1} onChange={(v) => set("ratio1", v)}>
                <AnyOption />
                {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((v) => (
                  <option key={v} value={v}>
                    A: {v} / B: {(1 - v).toFixed(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ratio basis">
              <Select
                value={x.solventUnit}
                onChange={(v) => set("solventUnit", v)}
              >
                <AnyOption />
                <option value="w">Weight</option>
                <option value="v">Volume</option>
                <option value="mol">Molar</option>
              </Select>
            </Field>
          </div>
          <button className="primary" disabled={busy} onClick={search}>
            {busy ? "Searching…" : "Search atlas"} <ChevronRight size={17} />
          </button>
        </div>
        <div className="results-panel">
          <div className="results-summary">
            <Database size={25} />
            <div>
              <span className="eyebrow">ATLAS RESULTS</span>
              <strong>{total.toLocaleString()}</strong>
              <small>matching formulations</small>
            </div>
          </div>
          <p className="status">{message}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Salt</th>
                  <th>Solvent A</th>
                  <th>Ratio</th>
                  <th>Solvent B</th>
                  <th>Ratio</th>
                  <th>T</th>
                  <th>Concentration</th>
                  <th>κ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r["Li-salt"]}</td>
                    <td>{r.solvent_1}</td>
                    <td>{r.ratio_1}</td>
                    <td>{r.solvent_2}</td>
                    <td>{r.ratio_2}</td>
                    <td>{r.T * 100} K</td>
                    <td>
                      {r.concentration} {r["concentration-unit"]}
                    </td>
                    <td>{Number(r.K).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <UsageCounter label="Atlas searches" count={usage.count} />
    </>
  );
}

function Molecules({ catalog }: { catalog: Catalog }) {
  const [kind, setKind] = useState<"solvents" | "salts">("solvents");
  const [name, setName] = useState("EC");
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => setName(Object.keys(catalog[kind])[0]), [kind, catalog]);
  useEffect(() => {
    let cancelled = false;
    const file = kind === "salts" ? saltFiles[name] : solventFiles[name];
    if (!file || !stage.current) return;
    fetch(`${base}molecules/${kind}/${file}.mol`)
      .then((r) => r.text())
      .then((mol) => {
        if (cancelled || !stage.current || !window.$3Dmol) return;
        stage.current.innerHTML = "";
        const viewer = window.$3Dmol.createViewer(stage.current, {
          backgroundColor: "#eef2ef",
        });
        viewer.addModel(mol, "mol");
        viewer.setStyle(
          {},
          { stick: { radius: 0.16 }, sphere: { scale: 0.28 } },
        );
        viewer.zoomTo();
        viewer.render();
        viewer.zoom(1.25);
      })
      .catch(() => {
        if (stage.current)
          stage.current.textContent = "Structure preview unavailable.";
      });
    return () => {
      cancelled = true;
    };
  }, [kind, name]);
  const file = kind === "salts" ? saltFiles[name] : solventFiles[name];
  return (
    <section className="panel">
      <div>
        <span className="eyebrow">MOLECULAR LIBRARY</span>
        <h2>Inspect the chemistry</h2>
        <p>
          Rotate, pan and zoom structures loaded from the published SCAN MOL
          library.
        </p>
        <div className="inline-controls">
          <Select
            value={kind}
            onChange={(v) => setKind(v as "solvents" | "salts")}
          >
            <option value="solvents">Solvents</option>
            <option value="salts">Lithium salts</option>
          </Select>
          <Select value={name} onChange={setName}>
            {Object.keys(catalog[kind]).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </div>
        <a
          className="text-link"
          href={`${base}molecules/${kind}/${file}.mol`}
          target="_blank"
        >
          Open molecular structure file <ChevronRight size={15} />
        </a>
      </div>
      <div className="molecule-stage">
        <div
          ref={stage}
          className="viewer"
          aria-label={`Interactive 3D structure of ${name}`}
        />
        <strong>{name}</strong>
        <span>
          {catalog[kind][name]?.length} normalized molecular descriptors
        </span>
      </div>
    </section>
  );
}

function GlobalReach() {
  const [visits, setVisits] = useState<number>();
  const [points, setPoints] = useState<ReachPoint[]>([]);
  useEffect(() => {
    readCounter("site-visits")
      .then(setVisits)
      .catch(() => {});
    Promise.all(
      reachRegions.map(async (r) => ({
        ...r,
        count: await readCounter(`country-${r.code}`),
      })),
    )
      .then((all) => setPoints(all.filter((p) => p.count > 0)))
      .catch(() => {});
  }, []);
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <section className="analytics">
      <div className="section-title">
        <span className="eyebrow">GLOBAL REACH</span>
        <h2>Where SCAN is being read.</h2>
        <p>
          Country-level counts are aggregated across visitors. The site stores
          only a country code counter—never an IP address or exact location.
        </p>
      </div>
      <div className="metrics analytics-metrics">
        <div>
          <b>{visits?.toLocaleString() ?? "—"}</b>
          <span>recorded visits</span>
        </div>
        <div>
          <b>{points.length}</b>
          <span>countries represented</span>
        </div>
        <div>
          <b>{points.reduce((a, b) => a + b.count, 0).toLocaleString()}</b>
          <span>country observations</span>
        </div>
      </div>
      <div className="map-card">
        <ComposableMap projectionConfig={{ scale: 135 }}>
          <Geographies geography={geo}>
            {({ geographies }: any) =>
              geographies.map((g: any) => (
                <Geography
                  key={g.rsmKey}
                  geography={g}
                  fill="#e8ebe9"
                  stroke="#fff"
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "#c7d7cf", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          {points.map((p) => (
            <Marker key={p.code} coordinates={p.coordinates}>
              <circle
                r={4 + 8 * Math.sqrt(p.count / max)}
                fill="#0b6b49"
                opacity=".8"
              />
              <title>
                {p.name}: {p.count}
              </title>
            </Marker>
          ))}
        </ComposableMap>
        <div className="country-list">
          {points
            .sort((a, b) => b.count - a.count)
            .map((p) => (
              <div key={p.code}>
                <span>{p.name}</span>
                <strong>{p.count}</strong>
              </div>
            ))}
        </div>
        <div className="map-note">
          <BarChart3 size={18} />
          <span>
            <b>Country-level aggregation</b>Dots grow with visitor count. City
            and IP-level histories are intentionally not retained.
          </span>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [page, setPage] = useState("home");
  useEffect(() => {
    fetch(`${base}features.json`)
      .then((r) => r.json())
      .then(setCatalog);
    if (!sessionStorage.getItem("scan-site-visit")) {
      sessionStorage.setItem("scan-site-visit", "1");
      bumpCounter("site-visits").catch(() => {});
      fetch("https://ipwho.is/")
        .then((r) => r.json())
        .then((d) => {
          if (d.success !== false && d.country_code)
            bumpCounter(`country-${String(d.country_code).toUpperCase()}`);
        })
        .catch(() => {});
    }
  }, []);
  const nav = useMemo(
    () => [
      ["home", "Overview"],
      ["search", "Search"],
      ["predict", "Prediction"],
      ["molecules", "Molecules"],
      ["advanced", "Advanced"],
      ["reach", "Global Reach"],
    ],
    [],
  );
  if (!catalog) return <div className="loading">Loading SCAN…</div>;
  return (
    <>
      <header>
        <button className="brand" onClick={() => setPage("home")}>
          <span>SC</span> SCAN
        </button>
        <nav>
          {nav.map(([id, label]) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>
        <a
          className="github"
          href="https://github.com/CodingWZL/SCAN"
          target="_blank"
        >
          <Github size={18} /> GitHub
        </a>
      </header>
      <main>
        {page === "home" && (
          <>
            <section className="hero">
              <div>
                <span className="pill">
                  <Sparkles size={14} /> Conductivity atlas for non-aqueous
                  electrolytes
                </span>
                <h1>
                  Design better electrolytes.
                  <br />
                  <em>Explore the possible.</em>
                </h1>
                <p>
                  SCAN brings an 11.5-million formulation atlas and a
                  dynamic-routing neural network into one fast, transparent
                  research workspace.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary"
                    onClick={() => setPage("predict")}
                  >
                    Start predicting <ChevronRight size={17} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setPage("search")}
                  >
                    Explore the atlas
                  </button>
                </div>
              </div>
              <div className="visual">
                <div className="glass">
                  <span>LIVE MODEL</span>
                  <b>20.0+</b>
                  <small>mS cm⁻¹</small>
                  <div className="sparkline" />
                </div>
              </div>
            </section>
            <section className="metrics">
              <div>
                <b>11,515,140</b>
                <span>virtual formulations</span>
              </div>
              <div>
                <b>13</b>
                <span>lithium salts</span>
              </div>
              <div>
                <b>38</b>
                <span>organic solvents</span>
              </div>
              <div>
                <b>0.372 mS cm⁻¹</b>
                <span>benchmark MAE</span>
              </div>
            </section>
            <section className="story">
              <div>
                <span className="eyebrow">WHY SCAN</span>
                <h2>From molecular descriptors to a navigable design space.</h2>
              </div>
              <div className="feature-list">
                <article>
                  <FlaskConical />
                  <h3>Predict</h3>
                  <p>
                    Run the published multi-feature fusion model locally in the
                    browser.
                  </p>
                </article>
                <article>
                  <Search />
                  <h3>Search</h3>
                  <p>
                    Filter the full conductivity atlas by chemistry and
                    experimental conditions.
                  </p>
                </article>
                <article>
                  <Layers3 />
                  <h3>Understand</h3>
                  <p>
                    Connect formulation choices with molecular descriptors and
                    interpretable chemistry.
                  </p>
                </article>
              </div>
            </section>
            <section className="citation">
              <BookOpen />
              <div>
                <span className="citation-label">CITE THIS WORK</span>
                <h3>
                  A dynamic routing-guided interpretable framework for
                  salt–solvent chemistry
                </h3>
                <p>
                  Zhilong Wang & Fengqi You · Nature Computational Science 6,
                  271-284 (2026) · doi:10.1038/s43588-026-00955-5
                </p>
              </div>
            </section>
            <footer>
              <div className="footer-primary">
                <b>SCAN</b>
                <p>
                  Developed by Zhilong Wang and Fengqi You at the PEESE Lab,
                  Cornell University.
                </p>
                <b>Contact</b>
                <p>
                  Feel free to reach out to Dr. Zhilong Wang (
                  <a href="mailto:zhilongwang.ai@gmail.com">
                    zhilongwang.ai@gmail.com
                  </a>
                  ).
                </p>
              </div>
              <div>
                <a href="https://www.peese.org/">PEESE Lab</a>
                <a href="https://github.com/CodingWZL/SCAN/blob/main/LICENSE">
                  License
                </a>
              </div>
            </footer>
          </>
        )}
        {page === "search" && (
          <div className="page">
            <div className="section-title">
              <span className="eyebrow">DATABASE QUERY</span>
              <h1>Search the conductivity atlas.</h1>
              <p>
                Filter by one component or combine several conditions. Blank
                fields match any value.
              </p>
            </div>
            <SearchPanel catalog={catalog} />
          </div>
        )}
        {page === "predict" && (
          <div className="page">
            <div className="section-title">
              <span className="eyebrow">MODEL PREDICTION</span>
              <h1>Predict a formulation.</h1>
              <p>The trained SCAN model runs locally with ONNX Runtime Web.</p>
            </div>
            <PredictionPanel catalog={catalog} />
          </div>
        )}
        {page === "molecules" && (
          <div className="page">
            <Molecules catalog={catalog} />
          </div>
        )}
        {page === "reach" && (
          <div className="page">
            <GlobalReach />
          </div>
        )}
        {page === "advanced" && (
          <div className="page">
            <div className="section-title">
              <span className="eyebrow">ADVANCED LAB</span>
              <h1>A home for what comes next.</h1>
              <p>
                A modular extension surface for community data, model training,
                simulation-box construction and conductivity calculation.
              </p>
            </div>
            <div className="advanced-grid">
              {[
                [
                  "Community data",
                  "Upload, validate and version contributed measurements.",
                ],
                [
                  "Model studio",
                  "Fine-tune small models against private or shared data.",
                ],
                [
                  "Simulation builder",
                  "Calculate molecule counts and prepare simulation boxes.",
                ],
                [
                  "Conductivity calculator",
                  "Convert diffusion coefficients into ionic conductivity.",
                ],
              ].map(([a, b], i) => (
                <article key={a}>
                  <span>0{i + 1}</span>
                  <h3>{a}</h3>
                  <p>{b}</p>
                  <button disabled>Planned</button>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
