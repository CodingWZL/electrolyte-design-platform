import { useState } from "react";
import { Download, ScatterChart, TableProperties } from "lucide-react";
import { downloadText, paretoFront, parseDelimited, toCsv } from "./math";
import type { FeatureUses, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

function parseRecords(text: string) {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

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

export function DataTools({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) { return <div className="advanced-tools"><DatasetHarmonizer usage={usage} onUse={onUse}/><ParetoExplorer usage={usage} onUse={onUse}/></div>; }
