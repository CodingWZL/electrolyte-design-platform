import { useState } from "react";
import { Box, Copy } from "lucide-react";
import { AVOGADRO } from "./math";
import type { FeatureUses, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

export function SimulationTools({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [box, setBox] = useState(45);
  const [density, setDensity] = useState(1.2);
  const [molarity, setMolarity] = useState(1);
  const [saltMw, setSaltMw] = useState(151.9);
  const [solventMw, setSolventMw] = useState(90.08);
  const [saltName, setSaltName] = useState("LiPF6");
  const [solventName, setSolventName] = useState("EC");
  const [result, setResult] = useState<{ salt: number; solvent: number; achieved: number; packmol: string }>();
  const build = () => {
    const volumeL = box ** 3 * 1e-27;
    const volumeMl = box ** 3 * 1e-24;
    const salt = Math.max(1, Math.round(molarity * volumeL * AVOGADRO));
    const massG = density * volumeMl;
    const saltMass = salt * saltMw / AVOGADRO;
    const solvent = Math.max(1, Math.round(Math.max(0, massG - saltMass) * AVOGADRO / solventMw));
    const achieved = salt / AVOGADRO / volumeL;
    const packmol = `tolerance 2.0\nfiletype pdb\noutput electrolyte-box.pdb\n\nstructure ${saltName}.pdb\n  number ${salt}\n  inside box 0. 0. 0. ${box} ${box} ${box}\nend structure\n\nstructure ${solventName}.pdb\n  number ${solvent}\n  inside box 0. 0. 0. ${box} ${box} ${box}\nend structure`;
    setResult({ salt, solvent, achieved, packmol }); onUse("box_build");
  };
  return <div className="advanced-tools"><article className="tool-card tool-card-wide"><div className="tool-heading"><div><span className="tool-kicker"><Box size={15} /> Molecular simulation</span><h3>Electrolyte box builder</h3><p>Convert box size, density and target molarity into reproducible molecule counts and a Packmol input scaffold.</p></div><UsageBadge count={usage?.box_build} /></div>
    <div className="input-grid"><label>Cubic box, Å<input type="number" value={box} onChange={(e)=>setBox(+e.target.value)} /></label><label>Solution density, g mL⁻¹<input type="number" value={density} onChange={(e)=>setDensity(+e.target.value)} /></label><label>Salt molarity, mol L⁻¹<input type="number" value={molarity} onChange={(e)=>setMolarity(+e.target.value)} /></label><label>Salt name<input value={saltName} onChange={(e)=>setSaltName(e.target.value)} /></label><label>Salt MW, g mol⁻¹<input type="number" value={saltMw} onChange={(e)=>setSaltMw(+e.target.value)} /></label><label>Solvent name<input value={solventName} onChange={(e)=>setSolventName(e.target.value)} /></label><label>Solvent MW, g mol⁻¹<input type="number" value={solventMw} onChange={(e)=>setSolventMw(+e.target.value)} /></label></div>
    <button className="primary-button" onClick={build}>Build composition</button>{result && <><div className="result-grid"><span><small>{saltName}</small><strong>{result.salt} molecules</strong></span><span><small>{solventName}</small><strong>{result.solvent} molecules</strong></span><span><small>Achieved molarity</small><strong>{result.achieved.toFixed(4)} M</strong></span></div><div className="code-result"><button onClick={() => navigator.clipboard.writeText(result.packmol)}><Copy size={14}/> Copy</button><pre>{result.packmol}</pre></div></>}
    <p className="method-note">Initial packing only. Density is an input estimate; equilibrate the force field, verify composition and finite-size effects, and add separate structures for mixed solvents or additives.</p>
  </article></div>;
}
