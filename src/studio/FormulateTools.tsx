import { useMemo, useState } from "react";
import { Beaker, Braces, Download, FlaskConical, Plus, Trash2 } from "lucide-react";
import { electrolyteComponents } from "./component-data";
import { downloadText, simplexPoints, toCsv } from "./math";
import type { FeatureUses, SolventInput, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

const solvents = electrolyteComponents.filter((component) =>
  ["solvent", "diluent"].includes(component.role),
);
const salts = electrolyteComponents.filter((component) => component.role === "salt");

function defaultSolvent(id: string, fraction: number): SolventInput {
  const component = electrolyteComponents.find((entry) => entry.id === id) ?? solvents[0];
  return {
    id: crypto.randomUUID(),
    name: component.aliases[0],
    molarMass: component.molarMass,
    density: component.density ?? 1,
    fraction,
  };
}

function RecipeBuilder({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [volume, setVolume] = useState(10);
  const [solutionDensity, setSolutionDensity] = useState(1.2);
  const [concentration, setConcentration] = useState(1);
  const [saltId, setSaltId] = useState("lipf6");
  const [purity, setPurity] = useState(99.9);
  const [additiveWt, setAdditiveWt] = useState(0);
  const [additiveName, setAdditiveName] = useState("VC");
  const [solventRows, setSolventRows] = useState<SolventInput[]>([
    defaultSolvent("ec", 50),
    defaultSolvent("dmc", 50),
  ]);
  const [result, setResult] = useState<{
    saltMass: number;
    weighedSalt: number;
    additiveMass: number;
    solventMass: number;
    rows: Array<SolventInput & { mass: number; volume: number }>;
  }>();

  const salt = electrolyteComponents.find((component) => component.id === saltId) ?? salts[0];

  const setSolvent = (id: string, patch: Partial<SolventInput>) =>
    setSolventRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  const chooseSolvent = (rowId: string, componentId: string) => {
    const component = electrolyteComponents.find((entry) => entry.id === componentId);
    if (!component) return;
    setSolvent(rowId, {
      name: component.aliases[0],
      molarMass: component.molarMass,
      density: component.density ?? 1,
    });
  };

  const calculate = () => {
    const totalMass = solutionDensity * volume;
    const saltMoles = concentration * volume / 1000;
    const saltMass = saltMoles * salt.molarMass;
    const weighedSalt = saltMass / Math.max(0.01, purity / 100);
    const additiveMass = totalMass * Math.max(0, additiveWt) / 100;
    const solventMass = totalMass - saltMass - additiveMass;
    const fractionTotal = solventRows.reduce((sum, row) => sum + Math.max(0, row.fraction), 0);
    if (solventMass <= 0 || !fractionTotal) return;
    const rows = solventRows.map((row) => {
      const mass = solventMass * Math.max(0, row.fraction) / fractionTotal;
      return { ...row, mass, volume: mass / Math.max(0.001, row.density) };
    });
    setResult({ saltMass, weighedSalt, additiveMass, solventMass, rows });
    onUse("recipe_calculate");
  };

  return (
    <div className="tool-stack">
      <div className="tool-card">
        <div className="tool-heading">
          <div><span className="eyebrow">FORMULATE</span><h3>Universal recipe builder</h3></div>
          <Beaker size={22} />
        </div>
        <p>Scale a multi-solvent electrolyte from target final volume, solution density and salt molarity.</p>
        <div className="input-grid four">
          <label>Final volume (mL)<input type="number" value={volume} min="0.01" onChange={(e) => setVolume(Number(e.target.value))} /></label>
          <label>Solution density (g mL⁻¹)<input type="number" value={solutionDensity} step="0.01" onChange={(e) => setSolutionDensity(Number(e.target.value))} /></label>
          <label>Salt molarity (mol L⁻¹)<input type="number" value={concentration} step="0.1" onChange={(e) => setConcentration(Number(e.target.value))} /></label>
          <label>Salt purity (%)<input type="number" value={purity} step="0.1" onChange={(e) => setPurity(Number(e.target.value))} /></label>
          <label>Salt<select value={saltId} onChange={(e) => setSaltId(e.target.value)}>{salts.map((entry) => <option key={entry.id} value={entry.id}>{entry.aliases[0]} · {entry.molarMass} g mol⁻¹</option>)}</select></label>
          <label>Additive name<input value={additiveName} onChange={(e) => setAdditiveName(e.target.value)} /></label>
          <label>Additive (wt% of solution)<input type="number" value={additiveWt} step="0.1" min="0" onChange={(e) => setAdditiveWt(Number(e.target.value))} /></label>
        </div>
        <div className="editable-table">
          <div className="editable-header"><b>Solvent</b><b>Mass parts</b><b>Density</b><span /></div>
          {solventRows.map((row) => (
            <div key={row.id}>
              <select value={solvents.find((entry) => entry.aliases[0] === row.name)?.id ?? ""} onChange={(e) => chooseSolvent(row.id, e.target.value)}>
                {solvents.map((entry) => <option key={entry.id} value={entry.id}>{entry.aliases[0]} · {entry.name}</option>)}
              </select>
              <input type="number" value={row.fraction} min="0" onChange={(e) => setSolvent(row.id, { fraction: Number(e.target.value) })} />
              <input type="number" value={row.density} step="0.01" min="0.01" onChange={(e) => setSolvent(row.id, { density: Number(e.target.value) })} />
              <button className="icon-button" aria-label="Remove solvent" disabled={solventRows.length <= 1} onClick={() => setSolventRows((current) => current.filter((entry) => entry.id !== row.id))}><Trash2 size={16} /></button>
            </div>
          ))}
          <button className="text-button" onClick={() => setSolventRows((current) => [...current, defaultSolvent("emc", 10)])}><Plus size={16} /> Add solvent or diluent</button>
        </div>
        <button className="primary" onClick={calculate}><FlaskConical size={16} /> Calculate recipe</button>
        {result && (
          <div className="result-panel">
            <div className="result-metrics">
              <div><span>Pure salt required</span><strong>{result.saltMass.toFixed(4)} g</strong></div>
              <div><span>Salt to weigh</span><strong>{result.weighedSalt.toFixed(4)} g</strong></div>
              <div><span>{additiveName || "Additive"}</span><strong>{result.additiveMass.toFixed(4)} g</strong></div>
              <div><span>Total solvent</span><strong>{result.solventMass.toFixed(4)} g</strong></div>
            </div>
            <table><thead><tr><th>Component</th><th>Mass</th><th>Approx. volume</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.mass.toFixed(4)} g</td><td>{row.volume.toFixed(3)} mL</td></tr>)}</tbody></table>
            <p className="tool-note">Volume additivity is not assumed. The calculation uses the entered final solution density; verify density and contraction experimentally.</p>
          </div>
        )}
      </div>
      <UsageBadge label="Recipe calculations" count={usage?.recipe_calculate} />
    </div>
  );
}

type ParsedFormulation = {
  original: string;
  salt?: { name: string; concentration?: number; unit?: string };
  solvents: Array<{ name: string; fraction?: number }>;
  additives: Array<{ name: string; amount?: number; unit?: string }>;
  warnings: string[];
};

function parseFormulation(text: string): ParsedFormulation {
  const normalized = text.replace(/[×]/g, "x").trim();
  const warnings: string[] = [];
  const concentration = normalized.match(/([0-9]*\.?[0-9]+)\s*(mol\s*L[-⁻]?1|mol\/L|M|mol\s*kg[-⁻]?1|mol\/kg|m)\b/i);
  const inMatch = normalized.match(/\bin\b/i);
  const saltZone = inMatch ? normalized.slice(0, inMatch.index) : normalized.split("+")[0];
  const saltTokens = saltZone.replace(concentration?.[0] ?? "", "").trim().split(/\s+/);
  const saltName = saltTokens.find((token) => /Li|Na|K|Mg|Zn/i.test(token));
  const afterIn = inMatch ? normalized.slice((inMatch.index ?? 0) + inMatch[0].length) : "";
  const base = afterIn.split("+")[0].trim();
  const ratioMatch = base.match(/\(?\s*([0-9.]+(?:\s*:\s*[0-9.]+)+)\s*\)?/);
  const namesPart = ratioMatch ? base.slice(0, ratioMatch.index).trim() : base;
  const names = namesPart.split(/\s*[:/,]\s*/).map((entry) => entry.replace(/[()]/g, "").trim()).filter(Boolean);
  const ratios = ratioMatch?.[1].split(":").map(Number) ?? [];
  const ratioTotal = ratios.reduce((sum, value) => sum + value, 0);
  const solventsParsed = names.map((name, index) => ({
    name,
    fraction: ratios[index] !== undefined && ratioTotal ? ratios[index] / ratioTotal : undefined,
  }));
  const additiveSegments = normalized.split("+").slice(1);
  const additives = additiveSegments.map((segment) => {
    const amount = segment.match(/([0-9]*\.?[0-9]+)\s*(wt%|vol%|mol%|ppm)/i);
    const name = segment.replace(amount?.[0] ?? "", "").trim();
    return { name, amount: amount ? Number(amount[1]) : undefined, unit: amount?.[2] };
  }).filter((entry) => entry.name);
  if (!saltName) warnings.push("Salt name was not confidently identified.");
  if (!solventsParsed.length) warnings.push("No solvent mixture was identified.");
  if (ratios.length && ratios.length !== names.length) warnings.push("The number of solvent names and ratio terms differ.");
  return {
    original: text,
    salt: saltName ? { name: saltName, concentration: concentration ? Number(concentration[1]) : undefined, unit: concentration?.[2] } : undefined,
    solvents: solventsParsed,
    additives,
    warnings,
  };
}

function FormulationParser({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState("1 M LiPF6 in EC:DMC 1:1 (v/v) + 2 wt% VC");
  const [parsed, setParsed] = useState<ParsedFormulation>();
  const run = () => {
    if (!text.trim()) return;
    setParsed(parseFormulation(text));
    onUse("formulation_parse");
  };
  return (
    <div className="tool-stack">
      <div className="tool-card">
        <div className="tool-heading"><div><span className="eyebrow">STANDARDIZE</span><h3>Formulation parser</h3></div><Braces size={22} /></div>
        <p>Convert common electrolyte notation into explicit machine-readable composition fields.</p>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <button className="primary" onClick={run}>Parse formulation</button>
        {parsed && <div className="result-panel"><pre>{JSON.stringify(parsed, null, 2)}</pre><button className="secondary" onClick={() => downloadText("formulation.json", JSON.stringify(parsed, null, 2), "application/json")}><Download size={16} /> Export JSON</button><p className="tool-note">This parser is deliberately conservative. Review ambiguous names and ratio bases before using the output in an experiment or model.</p></div>}
      </div>
      <UsageBadge label="Formulations parsed" count={usage?.formulation_parse} />
    </div>
  );
}

function DoeGenerator({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [names, setNames] = useState("EC,DMC,EMC");
  const [divisions, setDivisions] = useState(4);
  const [temperatures, setTemperatures] = useState("273,298,323");
  const [concentrations, setConcentrations] = useState("0.5,1.0,1.5");
  const [rows, setRows] = useState<Array<Record<string, number>>>([]);
  const components = useMemo(() => names.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 5), [names]);
  const generate = () => {
    if (components.length < 2) return;
    const mixtures = simplexPoints(components.length, Math.max(1, Math.min(10, Math.round(divisions))));
    const temps = temperatures.split(",").map(Number).filter(Number.isFinite);
    const concs = concentrations.split(",").map(Number).filter(Number.isFinite);
    const output: Array<Record<string, number>> = [];
    for (const mixture of mixtures) for (const temperature of temps) for (const concentration of concs) {
      const row: Record<string, number> = { temperature, concentration };
      components.forEach((name, index) => { row[name] = mixture[index]; });
      output.push(row);
    }
    setRows(output.slice(0, 2000));
    onUse("doe_generate");
  };
  const csv = rows.length ? toCsv([Object.keys(rows[0]), ...rows.map((row) => Object.keys(rows[0]).map((key) => row[key]))]) : "";
  return (
    <div className="tool-stack">
      <div className="tool-card">
        <div className="tool-heading"><div><span className="eyebrow">DESIGN OF EXPERIMENTS</span><h3>Constrained mixture design</h3></div><FlaskConical size={22} /></div>
        <p>Generate a simplex-lattice solvent design crossed with temperature and salt-concentration factors.</p>
        <div className="input-grid four"><label>Components<input value={names} onChange={(e) => setNames(e.target.value)} /></label><label>Simplex divisions<input type="number" value={divisions} min="1" max="10" onChange={(e) => setDivisions(Number(e.target.value))} /></label><label>Temperatures (K)<input value={temperatures} onChange={(e) => setTemperatures(e.target.value)} /></label><label>Concentrations (mol L⁻¹)<input value={concentrations} onChange={(e) => setConcentrations(e.target.value)} /></label></div>
        <button className="primary" onClick={generate}>Generate design</button>
        {rows.length > 0 && <div className="result-panel"><div className="result-metrics"><div><span>Experiments</span><strong>{rows.length}</strong></div><div><span>Mixture components</span><strong>{components.length}</strong></div></div><div className="table-wrap"><table><thead><tr>{Object.keys(rows[0]).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={index}>{Object.keys(rows[0]).map((key) => <td key={key}>{row[key].toFixed(key === "temperature" ? 0 : 3)}</td>)}</tr>)}</tbody></table></div><button className="secondary" onClick={() => downloadText("electrolyte-doe.csv", csv, "text/csv")}><Download size={16} /> Export full design</button></div>}
      </div>
      <UsageBadge label="DoE matrices generated" count={usage?.doe_generate} />
    </div>
  );
}

export function FormulateTools({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  return <div className="advanced-tools"><RecipeBuilder usage={usage} onUse={onUse} /><FormulationParser usage={usage} onUse={onUse} /><DoeGenerator usage={usage} onUse={onUse} /></div>;
}
