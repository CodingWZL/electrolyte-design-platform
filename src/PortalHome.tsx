import {
  ArrowUpRight,
  Atom,
  BookOpen,
  ChevronRight,
  Droplets,
  Layers3,
} from "lucide-react";

export type PlatformDestination = "scan-home" | "ionnet-home";

const publications = [
  {
    journal: "Nature Computational Science",
    year: "2026",
    title:
      "A dynamic routing-guided interpretable framework for salt–solvent chemistry",
    authors: "Zhilong Wang & Fengqi You",
    detail: "Volume 6 · 271–284",
    doi: "https://doi.org/10.1038/s43588-026-00955-5",
    accent: "liquid",
  },
  {
    journal: "Science Advances",
    year: "2026",
    title:
      "Decoding the chemical space of fast-ion conductors via a descriptor-guided transfer learning framework",
    authors: "Zhilong Wang & Fengqi You",
    detail: "Volume 12 · eaee4959",
    doi: "https://doi.org/10.1126/sciadv.aee4959",
    accent: "solid",
  },
] as const;

const platforms = [
  {
    id: "scan-home" as const,
    name: "SCAN",
    type: "Non-aqueous electrolytes",
    description:
      "Search 11.5 million liquid-electrolyte formulations, run conductivity prediction and use a complete browser-native research studio.",
    metrics: ["11.5M formulations", "13 salts", "38 solvents"],
    icon: Droplets,
    tone: "liquid",
  },
  {
    id: "ionnet-home" as const,
    name: "IonNet",
    type: "Solid-state fast-ion conductors",
    description:
      "Explore computational and experimental conductor data, Materials Project candidates and ensemble substitution predictions.",
    metrics: ["8,750 computed", "398 experiments", "207,980 predictions"],
    icon: Atom,
    tone: "solid",
  },
] as const;

export function PortalHome({
  onOpenPlatform,
}: {
  onOpenPlatform: (destination: PlatformDestination) => void;
}) {
  return (
    <div className="portal-home">
      <section className="portal-hero">
        <div>
          <span className="pill">
            <Layers3 size={14} /> AI platforms for electrolyte discovery
          </span>
          <h1>
            One research home.
            <br />
            <em>Many chemical spaces.</em>
          </h1>
          <p>
            SCAN connects peer-reviewed models, published datasets and
            interactive scientific tools across liquid and solid electrolytes.
            Each publication opens into its own focused platform.
          </p>
        </div>
        <div className="portal-orbit" aria-hidden="true">
          <div className="orbit-core">SCAN</div>
          <span className="orbit-node orbit-node-liquid">Liquid</span>
          <span className="orbit-node orbit-node-solid">Solid</span>
        </div>
      </section>

      <section className="portal-section" id="publications">
        <div className="portal-section-heading">
          <span className="eyebrow">PUBLICATIONS</span>
          <h2>Research that becomes usable software.</h2>
          <p>
            Two complementary studies, spanning formulation-level liquid
            electrolytes and composition-level solid ionic conductors.
          </p>
        </div>
        <div className="publication-grid">
          {publications.map((publication, index) => (
            <a
              className={`publication-card ${publication.accent}`}
              href={publication.doi}
              target="_blank"
              rel="noreferrer"
              key={publication.doi}
            >
              <div className="publication-number">0{index + 1}</div>
              <div>
                <span className="publication-journal">
                  {publication.journal} · {publication.year}
                </span>
                <h3>{publication.title}</h3>
                <p>{publication.authors}</p>
                <small>{publication.detail}</small>
              </div>
              <ArrowUpRight size={21} />
            </a>
          ))}
        </div>
      </section>

      <section className="portal-section platform-section" id="platforms">
        <div className="portal-section-heading">
          <span className="eyebrow">PLATFORMS</span>
          <h2>Choose a design space.</h2>
          <p>
            The platform grid is data-driven and expands naturally to a 3 × 3
            catalog as future research tools are added.
          </p>
        </div>
        <div className="platform-grid">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            return (
              <button
                className={`platform-card ${platform.tone}`}
                key={platform.id}
                onClick={() => onOpenPlatform(platform.id)}
              >
                <div className="platform-icon">
                  <Icon size={25} />
                </div>
                <span>{platform.type}</span>
                <h3>{platform.name}</h3>
                <p>{platform.description}</p>
                <div className="platform-metrics">
                  {platform.metrics.map((metric) => (
                    <small key={metric}>{metric}</small>
                  ))}
                </div>
                <strong>
                  Open platform <ChevronRight size={17} />
                </strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="portal-footnote">
        <BookOpen size={19} />
        <p>
          Developed by Zhilong Wang and Fengqi You at the PEESE Lab, Cornell
          University. Models and datasets remain linked to their source
          publications and repositories.
        </p>
      </section>
    </div>
  );
}
