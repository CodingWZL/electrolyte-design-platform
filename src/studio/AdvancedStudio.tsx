import { useState } from "react";
import { BarChart3, Beaker, Boxes, FlaskConical } from "lucide-react";
import type { FeatureUses, TrackStudioUse } from "./types";
import { CharacterizeTools } from "./CharacterizeTools";
import { DataTools } from "./DataTools";
import { FormulateTools } from "./FormulateTools";
import { SimulationTools } from "./SimulationTools";

type Tab = "formulate" | "characterize" | "simulate" | "data";

export function AdvancedStudio({ usage, onUse }: { usage?: FeatureUses; onUse: TrackStudioUse }) {
  const [tab, setTab] = useState<Tab>("formulate");
  const tabs: Array<[Tab, string, typeof Beaker]> = [["formulate","Formulate",FlaskConical],["characterize","Characterize",BarChart3],["simulate","Simulate",Boxes],["data","Data & ML",Beaker]];
  return <section className="studio-page"><div className="studio-hero"><span className="eyebrow">Independent research utilities</span><h1>Electrolyte research studio</h1><p>Shared tools for liquid- and solid-electrolyte researchers: formulation math, impedance, transport, temperature fitting, simulation setup and multi-objective data analysis. All calculations stay in the browser.</p></div><div className="studio-tabs" role="tablist">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)} role="tab" aria-selected={tab===id}><Icon size={17}/>{label}</button>)}</div>{tab==="formulate"&&<FormulateTools usage={usage} onUse={onUse}/>} {tab==="characterize"&&<CharacterizeTools usage={usage} onUse={onUse}/>} {tab==="simulate"&&<SimulationTools usage={usage} onUse={onUse}/>} {tab==="data"&&<DataTools usage={usage} onUse={onUse}/>}</section>;
}
