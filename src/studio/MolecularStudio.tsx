import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Atom, BookOpen, Box, Search } from "lucide-react";
import { electrolyteComponents } from "./component-data";
import type { FeatureUses, TrackStudioUse } from "./types";
import { UsageBadge } from "./UsageBadge";

const MolecularEditor = lazy(() =>
  import("./MolecularEditor").then((module) => ({
    default: module.MolecularEditor,
  })),
);

type Tab = "editor" | "components" | "library";

export function MolecularStudio({
  library,
  usage,
  onUse,
}: {
  library: ReactNode;
  usage?: FeatureUses;
  onUse: TrackStudioUse;
}) {
  const [tab, setTab] = useState<Tab>("editor");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [searches, setSearches] = useState("");
  const filtered = useMemo(() => {
    const normalized = searches.trim().toLowerCase();
    return electrolyteComponents.filter((component) => {
      const matchesRole = role === "all" || component.role === role;
      const haystack = [
        component.name,
        ...component.aliases,
        component.formula,
        component.family,
      ]
        .join(" ")
        .toLowerCase();
      return matchesRole && (!normalized || haystack.includes(normalized));
    });
  }, [role, searches]);

  const runSearch = () => {
    setSearches(query);
    onUse("component_search");
  };

  return (
    <section className="studio-page">
      <div className="section-title">
        <span className="eyebrow">MOLECULAR & COMPONENT STUDIO</span>
        <h1>Work with any electrolyte molecule.</h1>
        <p>
          Convert structures, calculate general cheminformatics properties, inspect
          electrolyte components, or return to the published SCAN molecular library.
        </p>
      </div>
      <div className="studio-tabs" role="tablist" aria-label="Molecular studio tools">
        <button className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>
          <Atom size={17} /> Molecular editor
        </button>
        <button
          className={tab === "components" ? "active" : ""}
          onClick={() => setTab("components")}
        >
          <BookOpen size={17} /> Component encyclopedia
        </button>
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          <Box size={17} /> SCAN library
        </button>
      </div>

      {tab === "editor" && (
        <>
          <Suspense fallback={<div className="tool-card">Loading the molecular editor…</div>}>
            <MolecularEditor onUse={() => onUse("molecule_analyze")} />
          </Suspense>
          <UsageBadge label="Molecule analyses" count={usage?.molecule_analyze} />
        </>
      )}

      {tab === "components" && (
        <>
          <div className="tool-card encyclopedia-card">
            <div className="tool-heading">
              <div>
                <span className="eyebrow">REFERENCE LIBRARY</span>
                <h3>Electrolyte component encyclopedia</h3>
              </div>
              <BookOpen size={22} />
            </div>
            <div className="component-search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && runSearch()}
                placeholder="Search EC, LiFSI, ether, carbonate…"
              />
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="all">All roles</option>
                <option value="solvent">Solvents</option>
                <option value="salt">Salts</option>
                <option value="additive">Additives</option>
                <option value="diluent">Diluents</option>
              </select>
              <button className="primary" onClick={runSearch}>
                <Search size={16} /> Search components
              </button>
            </div>
            <p className="tool-note">
              Representative physical properties near ambient temperature. Values vary
              with temperature, purity and source; verify the primary literature or SDS
              before experimental use.
            </p>
          </div>
          <div className="component-grid">
            {filtered.map((component) => (
              <article key={component.id} className="component-card">
                <div>
                  <span className={`role-pill ${component.role}`}>{component.role}</span>
                  <span>{component.family}</span>
                </div>
                <h3>{component.aliases[0]}</h3>
                <b>{component.name}</b>
                <code>{component.smiles}</code>
                <dl>
                  <div><dt>Formula</dt><dd>{component.formula}</dd></div>
                  <div><dt>Molar mass</dt><dd>{component.molarMass} g mol⁻¹</dd></div>
                  {component.density && <div><dt>Density</dt><dd>{component.density} g mL⁻¹</dd></div>}
                  {component.dielectric && <div><dt>Dielectric εr</dt><dd>{component.dielectric}</dd></div>}
                  {component.viscosity && <div><dt>Viscosity</dt><dd>{component.viscosity} mPa·s</dd></div>}
                  {component.boilingPoint && <div><dt>Boiling point</dt><dd>{component.boilingPoint} °C</dd></div>}
                  {component.flashPoint !== undefined && <div><dt>Flash point</dt><dd>{component.flashPoint} °C</dd></div>}
                </dl>
                <p>{component.notes}</p>
              </article>
            ))}
          </div>
          <UsageBadge label="Component searches" count={usage?.component_search} />
        </>
      )}

      {tab === "library" && library}
    </section>
  );
}
