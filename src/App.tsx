import { useEffect, useMemo, useRef, useState } from "react";
import * as ort from "onnxruntime-web";
import {
  analyticsConfigured,
  readAnalytics,
  recordAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsSummary,
} from "./analytics";
import { reachRegionsData } from "./reach-regions";
import {
  Atom,
  BarChart3,
  BookOpen,
  ChevronRight,
  Copy,
  Database,
  Download,
  FlaskConical,
  Github,
  Layers3,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { AdvancedStudio } from "./studio/AdvancedStudio";
import { MolecularStudio } from "./studio/MolecularStudio";
import type { StudioToolId } from "./studio/types";
import { IonNetPlatform } from "./IonNetPlatform";
import { PortalHome, type PlatformDestination } from "./PortalHome";
import { copyText, downloadCsv } from "./research-utils";

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
const pageDestinations = new Set([
  "portal",
  "publications",
  "platforms",
  "scan-home",
  "scan-search",
  "scan-predict",
  "scan-molecules",
  "scan-advanced",
  "tools",
  "ionnet-home",
  "ionnet-data",
  "ionnet-predict",
  "reach",
]);

function hashDestination() {
  const destination = window.location.hash.replace(/^#/, "");
  return pageDestinations.has(destination) ? destination : "portal";
}
const chinaRegionNames: Record<string, string> = {
  HK: "Hong Kong, China",
  TW: "Taiwan, China",
  MO: "Macao, China",
};
const reachRegions: Omit<ReachPoint, "count">[] = reachRegionsData.map(
  (region) => ({
    ...region,
    name: chinaRegionNames[region.code] ?? region.name,
    coordinates: [...region.coordinates] as [number, number],
  }),
);

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
function UsageCounter({ label, count }: { label: string; count?: number }) {
  return (
    <div className="usage-counter">
      <span>{label}</span>
      <strong>{count === undefined ? "…" : count.toLocaleString()}</strong>
      <small>{count === undefined ? "syncing securely" : "verified total uses"}</small>
    </div>
  );
}

function PredictionPanel({
  catalog,
  usageCount,
  onUsage,
}: {
  catalog: Catalog;
  usageCount?: number;
  onUsage: () => void;
}) {
  const [x, setX] = useState(predictionDefaults);
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState<number>();
  const [message, setMessage] = useState("");
  const ratio2 = +(1 - x.ratio1).toFixed(1);
  const set = <K extends keyof PredictionInputs>(
    k: K,
    v: PredictionInputs[K],
  ) => setX((s) => ({ ...s, [k]: v }));
  async function predict() {
    setBusy(true);
    setMessage("Running the trained dynamic-routing model in your browser…");
    onUsage();
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
  async function copyPrediction() {
    if (prediction === undefined) return;
    await copyText(
      [
        "SCAN conductivity prediction",
        `Salt: ${x.salt}`,
        `Solvents: ${x.solvent1} ${x.ratio1} / ${x.solvent2} ${ratio2} (${x.solventUnit})`,
        `Concentration: ${x.concentration} ${x.concentrationUnit}`,
        `Temperature: ${x.temperature} K`,
        `Conductivity: ${prediction.toFixed(3)} mS cm^-1`,
      ].join("\n"),
    );
    setMessage("Prediction copied with its formulation and conditions.");
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
          {prediction !== undefined && (
            <button className="result-action" onClick={() => void copyPrediction()}>
              <Copy size={15} /> Copy result
            </button>
          )}
        </div>
      </div>
      <div className="scientific-note">
        <b>Model scope</b>
        <span>
          The prediction applies to the selected two-solvent formulation within
          SCAN&apos;s published chemical and temperature space. Treat it as a
          screening estimate; water content, impurities and laboratory protocol
          can materially change measured conductivity.
        </span>
      </div>
      <UsageCounter label="Conductivity predictions" count={usageCount} />
    </>
  );
}

function SearchPanel({
  catalog,
  usageCount,
  onUsage,
}: {
  catalog: Catalog;
  usageCount?: number;
  onUsage: () => void;
}) {
  const [x, setX] = useState(searchDefaults);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Result[]>([]);
  const [message, setMessage] = useState(
    "Select one or more filters. Unspecified fields match any value.",
  );
  const [total, setTotal] = useState(0);
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
    onUsage();
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
  function clearFilters() {
    setX({
      salt: "",
      concentration: "",
      concentrationUnit: "",
      solvent1: "",
      ratio1: "",
      solvent2: "",
      solventUnit: "",
      temperature: "",
    });
    setRows([]);
    setTotal(0);
    setMessage("Filters cleared. Select any known component or condition.");
  }
  function exportResults() {
    downloadCsv(
      "scan-atlas-results.csv",
      [
        { key: "salt", label: "Lithium salt" },
        { key: "solventA", label: "Solvent A" },
        { key: "ratioA", label: "Ratio A" },
        { key: "solventB", label: "Solvent B" },
        { key: "ratioB", label: "Ratio B" },
        { key: "ratioBasis", label: "Ratio basis" },
        { key: "temperatureK", label: "Temperature (K)" },
        { key: "concentration", label: "Concentration" },
        { key: "concentrationUnit", label: "Concentration unit" },
        { key: "conductivity", label: "Conductivity (mS cm^-1)" },
      ],
      rows.map((row) => ({
        salt: row["Li-salt"],
        solventA: row.solvent_1,
        ratioA: row.ratio_1,
        solventB: row.solvent_2,
        ratioB: row.ratio_2,
        ratioBasis: row["solvent-unit"],
        temperatureK: row.T * 100,
        concentration: row.concentration,
        concentrationUnit: row["concentration-unit"],
        conductivity: row.K,
      })),
    );
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
          <div className="control-actions">
            <button className="primary" disabled={busy} onClick={search}>
              {busy ? "Searching…" : "Search atlas"} <ChevronRight size={17} />
            </button>
            <button className="secondary" disabled={busy} onClick={clearFilters}>
              <RotateCcw size={15} /> Clear filters
            </button>
          </div>
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
          {rows.length > 0 && (
            <button className="result-action" onClick={exportResults}>
              <Download size={15} /> Export shown results as CSV
            </button>
          )}
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
      <UsageCounter label="Atlas searches" count={usageCount} />
    </>
  );
}

function ScanMoleculeLibrary({ catalog }: { catalog: Catalog }) {
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

function GlobalReach({
  summary,
  status,
}: {
  summary?: AnalyticsSummary;
  status: "loading" | "live" | "unavailable";
}) {
  const regionByCode = new Map(reachRegions.map((region) => [region.code, region]));
  const countByCode = new Map((summary?.countries ?? []).map((country) => [country.code, country]));
  const unattributed =
    summary?.countries.find((country) => country.code === "ZZ")?.count ?? 0;
  const chinaCodes = ["CN", "HK", "TW", "MO"];
  const chinaCount = chinaCodes.reduce((sum, code) => sum + (countByCode.get(code)?.count ?? 0), 0);
  const listedCountries = (summary?.countries ?? [])
    .filter(
      ({ code, count }) =>
        count > 0 && code !== "ZZ" && !["HK", "TW", "MO"].includes(code),
    )
    .map((country) => ({
      ...country,
      count: country.code === "CN" ? chinaCount : country.count,
      name:
        country.code === "CN"
          ? "China"
          : regionByCode.get(country.code)?.name ?? country.code,
    }))
    .sort((a, b) => b.count - a.count);
  const points = listedCountries
    .map(({ code, count }) => {
      const region = regionByCode.get(code);
      return region ? { ...region, count } : undefined;
    })
    .filter((point): point is ReachPoint => Boolean(point && point.count > 0));
  const visits = summary?.totalViews;
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <section className="analytics">
      <div className="section-title">
        <span className="eyebrow">GLOBAL REACH</span>
        <h2>Where AI for Battery is being used.</h2>
        <p>
          These are cumulative visits to the complete research portal,
          including both SCAN and IonNet. Country-level totals are written
          atomically by a private analytics service.
        </p>
      </div>
      <div className="metrics analytics-metrics">
        <div>
          <b>{visits === undefined ? "…" : visits.toLocaleString()}</b>
          <span>recorded visits</span>
        </div>
        <div>
          <b>{summary ? listedCountries.length : "…"}</b>
          <span>countries represented</span>
        </div>
        <div>
          <b>
            {visits === undefined
              ? "…"
              : Math.max(0, visits - unattributed).toLocaleString()}
          </b>
          <span>attributed country visits</span>
        </div>
        <div>
          <b>{summary ? summary.searchUses.toLocaleString() : "…"}</b>
          <span>data searches across both platforms</span>
        </div>
        <div>
          <b>{summary ? summary.predictionUses.toLocaleString() : "…"}</b>
          <span>model predictions across both platforms</span>
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
          {listedCountries.map((country) => (
            <div key={country.code}>
              <span>{country.name}</span>
              <strong>{country.count}</strong>
            </div>
          ))}
          {unattributed > 0 && (
            <div>
              <span>Unattributed visits</span>
              <strong>{unattributed}</strong>
            </div>
          )}
        </div>
        <div className="map-note">
          <BarChart3 size={18} />
          <span>
            <b>
              {status === "live"
                ? `Live verified totals · private atomic storage${
                    summary?.verifiedSince
                      ? ` · since ${new Date(summary.verifiedSince).toLocaleDateString("en-US")}`
                      : ""
                  }`
                : status === "loading"
                  ? "Connecting to the secure analytics service…"
                  : "Analytics service is temporarily unavailable"}
            </b>
            Country is assigned by the server. Raw IP addresses and city-level
            histories are not stored. Every country value is a cumulative
            all-time total and remains cumulative across deployments. A visit
            is recorded once when the portal is opened; moving between SCAN and
            IonNet does not artificially add another visit.
          </span>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [catalog, setCatalog] = useState<Catalog>();
  const [page, setPage] = useState(() => {
    const destination = hashDestination();
    return destination === "publications" || destination === "platforms"
      ? "portal"
      : destination;
  });
  const [analytics, setAnalytics] = useState<AnalyticsSummary>();
  const [linkCopied, setLinkCopied] = useState(false);
  const [analyticsStatus, setAnalyticsStatus] = useState<
    "loading" | "live" | "unavailable"
  >("loading");
  useEffect(() => {
    fetch(`${base}features.json`)
      .then((r) => r.json())
      .then(setCatalog);
    let active = true;
    const connect = async () => {
      if (!analyticsConfigured()) {
        if (active) setAnalyticsStatus("unavailable");
        return;
      }
      try {
        const summary = await recordAnalyticsEvent("page_view");
        if (active && summary) {
          setAnalytics(summary);
          setAnalyticsStatus("live");
        }
      } catch {
        try {
          const summary = await readAnalytics();
          if (active && summary) {
            setAnalytics(summary);
            setAnalyticsStatus("live");
          }
        } catch {
          if (active) setAnalyticsStatus("unavailable");
        }
      }
    };
    connect();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const syncFromHash = () => {
      const destination = hashDestination();
      if (destination === "publications" || destination === "platforms") {
        setPage("portal");
        window.requestAnimationFrame(() =>
          document
            .getElementById(destination)
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
        return;
      }
      setPage(destination);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);
  useEffect(() => {
    if (!catalog || page !== "portal") return;
    const destination = hashDestination();
    if (destination === "publications" || destination === "platforms") {
      window.requestAnimationFrame(() =>
        document
          .getElementById(destination)
          ?.scrollIntoView({ behavior: "auto", block: "start" }),
      );
    }
  }, [catalog, page]);
  const trackUsage = (type: AnalyticsEvent) => {
    recordAnalyticsEvent(type)
      .then((summary) => {
        if (summary) {
          setAnalytics(summary);
          setAnalyticsStatus("live");
        }
      })
      .catch(() => setAnalyticsStatus("unavailable"));
  };
  const trackStudioUse = (type: StudioToolId) => trackUsage(type);
  const nav = useMemo(() => {
    if (page.startsWith("ionnet")) {
      return [
        ["portal", "All platforms"],
        ["ionnet-home", "Overview"],
        ["ionnet-data", "Data Explorer"],
        ["ionnet-predict", "Prediction"],
        ["tools", "Research Tools"],
        ["reach", "Global Reach"],
      ];
    }
    if (page.startsWith("scan")) {
      return [
        ["portal", "All platforms"],
        ["scan-home", "Overview"],
        ["scan-search", "Search"],
        ["scan-predict", "Prediction"],
        ["scan-molecules", "Molecules"],
        ["tools", "Research Tools"],
        ["reach", "Global Reach"],
      ];
    }
    return [
      ["portal", "Home"],
      ["publications", "Publications"],
      ["platforms", "Platforms"],
      ["tools", "Research Tools"],
      ["reach", "Global Reach"],
    ];
  }, [page]);
  const navigate = (destination: string) => {
    const nextHash = destination === "portal" ? "" : `#${destination}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
      return;
    }
    if (destination === "publications" || destination === "platforms") {
      setPage("portal");
      window.requestAnimationFrame(() =>
        document
          .getElementById(destination)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }
    setPage(destination);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (!catalog) return <div className="loading">Loading AI for Battery…</div>;
  const ionNetView = page.startsWith("ionnet-")
    ? (page.replace("ionnet-", "") as "home" | "data" | "predict")
    : undefined;
  const githubUrl = page.startsWith("ionnet")
    ? "https://github.com/CodingWZL/IonNet"
    : "https://github.com/CodingWZL/SCAN";
  const copyPageLink = async () => {
    await copyText(window.location.href);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  };
  return (
    <>
      <header>
        <button className="brand" onClick={() => navigate("portal")}>
          <span>AI</span> AI for Battery
        </button>
        <nav>
          {nav.map(([id, label]) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="header-share" onClick={() => void copyPageLink()} aria-label="Copy a link to this research tool">
          <Copy size={16} /> {linkCopied ? "Copied" : "Copy link"}
        </button>
        <a
          className="github"
          href={githubUrl}
          target="_blank"
        >
          <Github size={18} /> GitHub
        </a>
      </header>
      <main>
        {page === "portal" && (
          <PortalHome
            onOpenPlatform={(destination: PlatformDestination) =>
              navigate(destination)
            }
          />
        )}
        {page === "scan-home" && (
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
                    onClick={() => navigate("scan-predict")}
                  >
                    Start predicting <ChevronRight size={17} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate("scan-search")}
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
                <b>AI for Battery</b>
                <p>
                  Director: Dr. Zhilong Wang (
                  <a href="mailto:zhilongwang.ai@gmail.com">zhilongwang.ai@gmail.com</a>)
                </p>
                <b>Contact</b>
                <p>
                  Feel free to reach out to Dr. Zhilong Wang (
                  <a href="mailto:zhilongwang.ai@gmail.com">
                    zhilongwang.ai@gmail.com
                  </a>
                  ) if you have any questions or suggestions.
                </p>
              </div>
              <div>
                <a href="https://www.peese.org/">PEESE Lab</a>
              </div>
            </footer>
          </>
        )}
        {page === "scan-search" && (
          <div className="page">
            <div className="section-title">
              <span className="eyebrow">DATABASE QUERY</span>
              <h1>Search the conductivity atlas.</h1>
              <p>
                Filter by one component or combine several conditions. Blank
                fields match any value.
              </p>
            </div>
            <SearchPanel
              catalog={catalog}
              usageCount={analytics?.searchUses}
              onUsage={() => trackUsage("search")}
            />
          </div>
        )}
        {page === "scan-predict" && (
          <div className="page">
            <div className="section-title">
              <span className="eyebrow">MODEL PREDICTION</span>
              <h1>Predict a formulation.</h1>
              <p>The trained SCAN model runs locally with ONNX Runtime Web.</p>
            </div>
            <PredictionPanel
              catalog={catalog}
              usageCount={analytics?.predictionUses}
              onUsage={() => trackUsage("prediction")}
            />
          </div>
        )}
        {page === "scan-molecules" && (
          <div className="page">
            <MolecularStudio
              library={<ScanMoleculeLibrary catalog={catalog} />}
              usage={analytics?.featureUses}
              onUse={trackStudioUse}
            />
          </div>
        )}
        {page === "reach" && (
          <div className="page">
            <GlobalReach summary={analytics} status={analyticsStatus} />
          </div>
        )}
        {(page === "tools" || page === "scan-advanced") && (
          <div className="page">
            <AdvancedStudio usage={analytics?.featureUses} onUse={trackStudioUse} />
          </div>
        )}
        {ionNetView && (
          <IonNetPlatform
            view={ionNetView}
            onNavigate={(view) => navigate(`ionnet-${view}`)}
            onSearchUse={() => trackUsage("search")}
            onPredictionUse={() => trackUsage("prediction")}
          />
        )}
      </main>
    </>
  );
}

export default App;
