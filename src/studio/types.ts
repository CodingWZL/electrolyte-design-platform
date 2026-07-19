export const studioToolIds = [
  "molecule_analyze",
  "component_search",
  "recipe_calculate",
  "formulation_parse",
  "doe_generate",
  "eis_analyze",
  "transport_analyze",
  "bruce_vincent",
  "temperature_fit",
  "box_build",
  "dataset_harmonize",
  "pareto_analyze",
] as const;

export type StudioToolId = (typeof studioToolIds)[number];
export type FeatureUses = Partial<Record<StudioToolId, number>>;
export type TrackStudioUse = (tool: StudioToolId) => void;

export type ComponentRecord = {
  id: string;
  name: string;
  aliases: string[];
  role: "solvent" | "salt" | "additive" | "diluent";
  family: string;
  formula: string;
  smiles: string;
  molarMass: number;
  density?: number;
  dielectric?: number;
  viscosity?: number;
  boilingPoint?: number;
  flashPoint?: number;
  notes: string;
};

export type SolventInput = {
  id: string;
  name: string;
  molarMass: number;
  density: number;
  fraction: number;
};

