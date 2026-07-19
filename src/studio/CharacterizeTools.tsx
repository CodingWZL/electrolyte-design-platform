import { useMemo, useState } from "react";
import { Activity, BatteryCharging, LineChart, Waves } from "lucide-react";
import { FARADAY, GAS_CONSTANT, linearRegression, parseDelimited } from "./math";
import type { FeatureUses, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

type Point = { f: number; zr: number; zi: number };

function parseThreeColumns(text: string): Point[] {
  return parseDelimited(text)
    .map((row) => row.slice(0, 3).map(Number))
    .filter((row) => row.length === 3 && row.every(Number.isFinite))
    .map(([f, zr, zi]) => ({ f, zr, zi: Math.abs(zi) }))
    .filter((point) => point.f > 0);
}

function cpeModel(point: Point, p: number[]) {
  const [rs, logRct, logQ, n] = p;
  const rct = Math.exp(logRct);
  const q = Math.exp(logQ);
  const wn = (2 * Math.PI * point.f) ** n;
  const phase = n * Math.PI / 2;
  const yr = 1 / rct + q * wn * Math.cos(phase);
  const yi = q * wn * Math.sin(phase);
  const denominator = yr ** 2 + yi ** 2;
  return { zr: rs + yr / denominator, zi: yi / denominator };
}

function fitRandles(points: Point[]) {
  const rs = Math.min(...points.map((point) => point.zr));
  const rct = Math.max(...points.map((point) => point.zr)) - rs || 1;
  const apex = points.reduce((best, point) => (point.zi > best.zi ? point : best));
  const initialN = 0.9;
  const q = 1 / (rct * (2 * Math.PI * apex.f) ** initialN);
  let parameters = [Math.max(0, rs), Math.log(rct), Math.log(Math.max(q, 1e-12)), initialN];
  let steps = [Math.max(rct * 0.15, 0.01), 0.4, 0.5, 0.05];
  const scale = Math.max(rct, 1);
  const loss = (candidate: number[]) =>
    points.reduce((sum, point) => {
      const modeled = cpeModel(point, candidate);
      return sum + ((modeled.zr - point.zr) / scale) ** 2 + ((modeled.zi - point.zi) / scale) ** 2;
    }, 0) / points.length;
  let best = loss(parameters);
  for (let pass = 0; pass < 90; pass += 1) {
    let improved = false;
    for (let index = 0; index < parameters.length; index += 1) {
      for (const direction of [-1, 1]) {
        const candidate = [...parameters];
        candidate[index] += steps[index] * direction;
        candidate[0] = Math.max(0, candidate[0]);
        candidate[3] = Math.min(1, Math.max(0.35, candidate[3]));
        const candidateLoss = loss(candidate);
        if (candidateLoss < best) {
          best = candidateLoss;
          parameters = candidate;
          improved = true;
        }
      }
    }
    if (!improved) steps = steps.map((step) => step * 0.72);
  }
  return {
    rs: parameters[0],
    rct: Math.exp(parameters[1]),
    q: Math.exp(parameters[2]),
    n: parameters[3],
    rmse: Math.sqrt(best) * scale,
    modeled: points.map((point) => cpeModel(point, parameters)),
  };
}

function NyquistPlot({ points, modeled }: { points: Point[]; modeled?: Array<{ zr: number; zi: number }> }) {
  if (!points.length) return null;
  const allX = [...points.map((point) => point.zr), ...(modeled?.map((point) => point.zr) ?? [])];
  const allY = [...points.map((point) => point.zi), ...(modeled?.map((point) => point.zi) ?? [])];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY, 1e-9);
  const sx = (value: number) => 28 + ((value - minX) / (maxX - minX || 1)) * 384;
  const sy = (value: number) => 224 - (value / maxY) * 188;
  return (
    <svg className="tool-plot" viewBox="0 0 440 250" role="img" aria-label="Nyquist plot">
      <path d="M28 20V224H426" className="plot-axis" />
      {modeled && <path d={modeled.map((point, i) => `${i ? "L" : "M"}${sx(point.zr)} ${sy(point.zi)}`).join(" ")} className="plot-line" />}
      {points.map((point, i) => <circle key={`${point.f}-${i}`} cx={sx(point.zr)} cy={sy(point.zi)} r="3.5" className="plot-point" />)}
      <text x="206" y="245">Z′ (Ω)</text><text x="4" y="18">−Z″</text>
    </svg>
  );
}

function EisWorkbench({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState("100000,4.2,0.3\n30000,4.8,2.4\n10000,8.1,5.2\n3000,13.5,5.0\n1000,17.2,2.8\n300,18.5,1.4");
  const [cellConstant, setCellConstant] = useState(1);
  const [result, setResult] = useState<ReturnType<typeof fitRandles>>();
  const points = useMemo(() => parseThreeColumns(text), [text]);
  const analyze = () => {
    if (points.length < 5) return;
    setResult(fitRandles(points));
    onUse("eis_analyze");
  };
  return <article className="tool-card tool-card-wide">
    <div className="tool-heading"><div><span className="tool-kicker"><Waves size={15} /> Impedance</span><h3>EIS workbench</h3><p>Import frequency, Z′ and −Z″; inspect a Nyquist plot and fit R<sub>s</sub>–(R<sub>ct</sub>∥CPE).</p></div><UsageBadge count={usage?.eis_analyze} /></div>
    <div className="tool-split"><div><label>Data (Hz, Ω, Ω)<textarea rows={9} value={text} onChange={(event) => setText(event.target.value)} /></label><label>Cell constant, cm⁻¹<input type="number" value={cellConstant} onChange={(event) => setCellConstant(Number(event.target.value))} /></label><button className="primary-button" onClick={analyze} disabled={points.length < 5}>Fit {points.length || 0} points</button></div><NyquistPlot points={points} modeled={result?.modeled} /></div>
    {result && <div className="result-grid"><span><small>R<sub>s</sub></small><strong>{result.rs.toPrecision(4)} Ω</strong></span><span><small>R<sub>ct</sub></small><strong>{result.rct.toPrecision(4)} Ω</strong></span><span><small>CPE Q / n</small><strong>{result.q.toExponential(3)} / {result.n.toFixed(3)}</strong></span><span><small>Conductivity</small><strong>{(cellConstant / result.rs).toPrecision(4)} S cm⁻¹</strong></span><span><small>Fit RMSE</small><strong>{result.rmse.toPrecision(3)} Ω</strong></span></div>}
    <p className="method-note">Screening-grade equivalent-circuit fit. Confirm circuit choice, geometry, inductive artifacts and residuals before reporting.</p>
  </article>;
}

function TransportCalculator({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [temperature, setTemperature] = useState(298.15);
  const [concentration, setConcentration] = useState(1000);
  const [cationD, setCationD] = useState(1.2e-10);
  const [anionD, setAnionD] = useState(1.8e-10);
  const [measured, setMeasured] = useState(8);
  const [result, setResult] = useState<{ sigma: number; tplus: number; haven?: number }>();
  const calculate = () => {
    if (![temperature, concentration, cationD, anionD].every((value) => value > 0)) return;
    const sigma = (FARADAY ** 2 / (GAS_CONSTANT * temperature)) * concentration * (cationD + anionD);
    setResult({ sigma, tplus: cationD / (cationD + anionD), haven: measured > 0 ? (measured * 0.1) / sigma : undefined });
    onUse("transport_analyze");
  };
  return <article className="tool-card"><div className="tool-heading"><div><span className="tool-kicker"><Activity size={15} /> Transport</span><h3>Diffusion → conductivity</h3></div><UsageBadge count={usage?.transport_analyze} /></div>
    <div className="input-grid"><label>Temperature, K<input type="number" value={temperature} onChange={(e) => setTemperature(+e.target.value)} /></label><label>Ion concentration, mol m⁻³<input type="number" value={concentration} onChange={(e) => setConcentration(+e.target.value)} /></label><label>D<sub>+</sub>, m² s⁻¹<input type="number" value={cationD} onChange={(e) => setCationD(+e.target.value)} /></label><label>D<sub>−</sub>, m² s⁻¹<input type="number" value={anionD} onChange={(e) => setAnionD(+e.target.value)} /></label><label>Measured κ, mS cm⁻¹<input type="number" value={measured} onChange={(e) => setMeasured(+e.target.value)} /></label></div>
    <button className="primary-button" onClick={calculate}>Calculate transport</button>{result && <div className="result-grid"><span><small>κ<sub>NE</sub></small><strong>{(result.sigma * 10).toFixed(2)} mS cm⁻¹</strong></span><span><small>Ideal t<sub>+</sub></small><strong>{result.tplus.toFixed(3)}</strong></span>{result.haven !== undefined && <span><small>Haven ratio κ/κ<sub>NE</sub></small><strong>{result.haven.toFixed(3)}</strong></span>}</div>}
    <p className="method-note">Nernst–Einstein assumes uncorrelated ions; the diffusion ratio is not a rigorous electrochemical transference number in concentrated electrolytes.</p>
  </article>;
}

function BruceVincent({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [values, setValues] = useState({ dv: 10, i0: 0.24, iss: 0.12, r0: 28, rss: 31 });
  const [answer, setAnswer] = useState<number>();
  const calculate = () => {
    const t = values.iss * (values.dv - values.i0 * values.r0) / (values.i0 * (values.dv - values.iss * values.rss));
    if (!Number.isFinite(t)) return;
    setAnswer(t); onUse("bruce_vincent");
  };
  return <article className="tool-card"><div className="tool-heading"><div><span className="tool-kicker"><BatteryCharging size={15} /> Polarization</span><h3>Bruce–Vincent t<sub>+</sub></h3></div><UsageBadge count={usage?.bruce_vincent} /></div>
    <div className="input-grid">{([['dv','ΔV, mV'],['i0','I₀, mA'],['iss','Iₛₛ, mA'],['r0','R₀, Ω'],['rss','Rₛₛ, Ω']] as const).map(([key,label]) => <label key={key}>{label}<input type="number" value={values[key]} onChange={(e) => setValues({...values,[key]:+e.target.value})} /></label>)}</div>
    <button className="primary-button" onClick={calculate}>Calculate t+</button>{answer !== undefined && <div className="result-callout"><small>Apparent cation transference number</small><strong>{answer.toFixed(3)}</strong></div>}
    <p className="method-note">Use matched symmetric-cell EIS before/after polarization. Interpret cautiously when interfacial reactions or concentration gradients violate the method assumptions.</p>
  </article>;
}

function TemperatureFit({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [text, setText] = useState("273.15,3.1\n283.15,4.5\n293.15,6.6\n303.15,8.8\n313.15,11.4\n323.15,14.1");
  const [fit, setFit] = useState<{ ea: number; r2: number; vtfT0: number; vtfR2: number }>();
  const analyze = () => {
    const rows = parseDelimited(text).map((row) => row.slice(0,2).map(Number)).filter((row) => row.length === 2 && row[0] > 0 && row[1] > 0);
    if (rows.length < 3) return;
    const arr = linearRegression(rows.map(([t]) => 1/t), rows.map(([,s]) => Math.log(s)));
    let best = { t0: 0, r2: -Infinity };
    const minT = Math.min(...rows.map(([t]) => t));
    for (let t0 = Math.max(100, minT - 180); t0 <= minT - 20; t0 += 1) {
      const candidate = linearRegression(rows.map(([t]) => 1/(t-t0)), rows.map(([,s]) => Math.log(s)));
      if (candidate.r2 > best.r2) best = { t0, r2: candidate.r2 };
    }
    setFit({ ea: -arr.slope * GAS_CONSTANT / 1000, r2: arr.r2, vtfT0: best.t0, vtfR2: best.r2 }); onUse("temperature_fit");
  };
  return <article className="tool-card"><div className="tool-heading"><div><span className="tool-kicker"><LineChart size={15} /> Temperature series</span><h3>Arrhenius & VTF comparison</h3></div><UsageBadge count={usage?.temperature_fit} /></div>
    <label>Temperature (K), conductivity (mS cm⁻¹)<textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} /></label><button className="primary-button" onClick={analyze}>Fit temperature series</button>
    {fit && <div className="result-grid"><span><small>Arrhenius E<sub>a</sub></small><strong>{fit.ea.toFixed(2)} kJ mol⁻¹</strong></span><span><small>Arrhenius R²</small><strong>{fit.r2.toFixed(4)}</strong></span><span><small>Best VTF T₀</small><strong>{fit.vtfT0.toFixed(0)} K</strong></span><span><small>VTF R²</small><strong>{fit.vtfR2.toFixed(4)}</strong></span></div>}<p className="method-note">The VTF T₀ search is an unconstrained diagnostic. Use physically justified bounds and uncertainty analysis for publication-quality fitting.</p>
  </article>;
}

export function CharacterizeTools({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  return <div className="advanced-tools"><EisWorkbench usage={usage} onUse={onUse} /><TransportCalculator usage={usage} onUse={onUse} /><BruceVincent usage={usage} onUse={onUse} /><TemperatureFit usage={usage} onUse={onUse} /></div>;
}
