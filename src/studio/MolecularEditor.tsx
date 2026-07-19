import { useState } from "react";
import type { RDKitModule } from "@rdkit/rdkit";
import { Download, FlaskConical, Play, RotateCcw } from "lucide-react";
import { downloadText } from "./math";

const base = import.meta.env.BASE_URL;
let rdkitPromise: Promise<RDKitModule> | undefined;

function loadRdkit() {
  if (rdkitPromise) return rdkitPromise;
  rdkitPromise = new Promise<RDKitModule>((resolve, reject) => {
    const start = () => window.initRDKitModule!({ locateFile: () => `${base}vendor/rdkit/RDKit_minimal.wasm` }).then(resolve).catch(reject);
    if (window.initRDKitModule) return start();
    const script = document.createElement("script");
    script.src = `${base}vendor/rdkit/RDKit_minimal.js`;
    script.async = true;
    script.onload = start;
    script.onerror = () => reject(new Error("RDKit could not be loaded."));
    document.head.appendChild(script);
  });
  return rdkitPromise;
}

const descriptorLabels: Record<string, string> = {
  MolWt: "Molecular weight", ExactMolWt: "Exact molecular weight", CrippenClogP: "Crippen cLogP",
  TPSA: "Topological polar surface area", NumHBA: "H-bond acceptors", NumHBD: "H-bond donors",
  NumRotatableBonds: "Rotatable bonds", NumRings: "Rings", NumAromaticRings: "Aromatic rings",
  FractionCSP3: "Fraction C sp³", HeavyAtomCount: "Heavy atoms", NumHeteroatoms: "Heteroatoms",
  NumAtoms: "Atoms", NumAmideBonds: "Amide bonds",
};

type Analysis = { smiles: string; inchi: string; molblock: string; svg: string; descriptors: Record<string, number>; fingerprintBits: number; version: string };
const examples = [
  ["EC", "O=C1OCCO1"], ["DME", "COCCOC"], ["FEC", "O=C1OCC(F)O1"],
  ["LiFSI anion", "[O-]S(=O)(F)N(S(=O)(=O)F)"], ["TFSI anion", "[O-]S(=O)(C(F)(F)F)N(S(=O)(=O)C(F)(F)F)"],
];

export function MolecularEditor({ onUse }: { onUse: () => void }) {
  const [structure, setStructure] = useState("O=C1OCCO1");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [status, setStatus] = useState("Paste a SMILES string to render and analyze it locally.");
  const [busy, setBusy] = useState(false);
  const analyze = async () => {
    if (!structure.trim()) return;
    setBusy(true); setStatus("Analyzing the current structure…");
    try {
      const rdkit = await loadRdkit();
      const molecule = rdkit.get_mol(structure.trim());
      if (!molecule || !molecule.is_valid()) { molecule?.delete(); throw new Error("RDKit did not recognize a valid structure string."); }
      const fingerprint = typeof molecule.get_morgan_fp === "function" ? String(molecule.get_morgan_fp()) : "";
      const result: Analysis = { smiles: molecule.get_smiles(), inchi: molecule.get_inchi(), molblock: molecule.get_molblock(), svg: molecule.get_svg(620, 380), descriptors: JSON.parse(molecule.get_descriptors()) as Record<string,number>, fingerprintBits: [...fingerprint].filter((bit)=>bit==="1").length, version: rdkit.version() };
      molecule.delete(); setStructure(result.smiles); setAnalysis(result); setStatus("Analysis complete. No molecular data left this browser."); onUse();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Analysis failed."); }
    finally { setBusy(false); }
  };
  const visibleDescriptors = analysis ? Object.entries(analysis.descriptors).filter(([,value])=>Number.isFinite(Number(value))).sort(([a],[b])=>(a in descriptorLabels?0:1)-(b in descriptorLabels?0:1)||a.localeCompare(b)).slice(0,24) : [];
  return <div className="molecule-workbench">
    <div className="tool-card molecule-editor-card"><div className="tool-heading"><div><span className="eyebrow">SMILES → STRUCTURE</span><h3>Convert, validate and export</h3><p>Standard RDKit chemistry runs entirely in your browser.</p></div><FlaskConical size={22}/></div>
      <label>SMILES string<textarea value={structure} onChange={(event)=>setStructure(event.target.value)} rows={4} spellCheck={false}/></label>
      <div className="example-row">{examples.map(([label,smiles])=><button key={label} onClick={()=>setStructure(smiles)}>{label}</button>)}</div>
      <div className="tool-actions"><button className="primary" disabled={busy} onClick={analyze}><Play size={16}/>{busy?"Analyzing…":"Render & analyze"}</button><button className="secondary" onClick={()=>{setStructure("O=C1OCCO1");setAnalysis(undefined);}}><RotateCcw size={16}/> Reset</button>{analysis&&<><button className="secondary" onClick={()=>downloadText("molecule.mol",analysis.molblock)}><Download size={16}/> MOL</button><button className="secondary" onClick={()=>downloadText("molecule.svg",analysis.svg,"image/svg+xml")}><Download size={16}/> SVG</button></>}</div>
      <p className="status">{status}</p>{analysis?<div className="molecule-svg large-preview" dangerouslySetInnerHTML={{__html:analysis.svg}}/>:<div className="structure-placeholder"><FlaskConical size={36}/><span>Your 2D structure will appear here</span></div>}
    </div>
    <div className="tool-card molecule-analysis-card"><span className="eyebrow">CHEMINFORMATICS</span><h3>General molecular properties</h3>{!analysis?<div className="empty-tool-state">Analyze a valid structure to calculate standard unnormalized RDKit descriptors, canonical identifiers and a Morgan fingerprint.</div>:<><div className="identifier-block"><b>Canonical SMILES</b><code>{analysis.smiles}</code><b>InChI</b><code>{analysis.inchi||"Unavailable for this structure"}</code></div><div className="descriptor-grid">{visibleDescriptors.map(([key,value])=><div key={key}><span>{descriptorLabels[key]??key}</span><strong>{Number(value).toLocaleString(undefined,{maximumFractionDigits:4})}</strong></div>)}</div><p className="tool-note">Morgan radius 2 fingerprint: {analysis.fingerprintBits} active bits · RDKit {analysis.version}. Values are independent of the SCAN model.</p></>}</div>
  </div>;
}
