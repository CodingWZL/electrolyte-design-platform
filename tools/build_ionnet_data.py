"""Build browser-ready IonNet datasets from the published repository files."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "IonNet-source"
EXTRACTED = SOURCE / ".extracted-results"
OUTPUT = ROOT / "deploy" / "public" / "data" / "ionnet"
RANDOM_SEED = 2026


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_json(name: str, records: list[dict[str, object]]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT / name).open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(records, handle, ensure_ascii=False, separators=(",", ":"))


def fixed_preview(frame: pd.DataFrame) -> list[dict[str, object]]:
    return frame.sample(n=min(100, len(frame)), random_state=RANDOM_SEED).to_dict(
        orient="records"
    )


def read_prediction_pairs(path: Path, series: int | None = None) -> pd.DataFrame:
    """Convert the repository's alternating formula/result rows to one record each."""
    raw = pd.read_csv(path, dtype=str, low_memory=False)
    formula_rows = raw.iloc[1::2].reset_index(drop=True)
    result_rows = raw.iloc[2::2].reset_index(drop=True)
    if len(formula_rows) != len(result_rows):
        raise ValueError(f"Unpaired prediction rows in {path.name}")
    frame = pd.DataFrame(
        {
            "mpId": formula_rows.iloc[:, 0],
            "parent": formula_rows.iloc[:, 1],
            "candidate": formula_rows.iloc[:, 2],
            "pSigma": pd.to_numeric(result_rows.iloc[:, 1], errors="raise"),
            "uncertainty": pd.to_numeric(result_rows.iloc[:, 2], errors="raise"),
        }
    )
    if series is not None:
        frame.insert(0, "series", series)
    return frame


def build() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    computational = pd.DataFrame(
        [
            {"formula": row["formula"], "sic": float(row["SIC"])}
            for row in read_csv(SOURCE / "data" / "Li-IonML-Computations.csv")
        ]
    )
    experimental = [
        {
            "id": row["ID"],
            "formula": row["composition"],
            "temperature": float(row["temperature"].strip() or 25),
            "conductivity": float(row["target"]),
            "logConductivity": float(row["log_target"]),
            "structureFamily": row["family"],
            "chemicalFamily": row["ChemicalFamily"],
            "source": row["source"],
        }
        for row in read_csv(SOURCE / "data" / "LiIonDatabase-Experiments-300K.csv")
    ]
    materials = pd.DataFrame(
        [
            {
                "mpId": row["MP ID"],
                "formula": row["Formula"],
                "energyAboveHull": float(row["Energy Above Hull (eV)"]),
                "bandGap": float(row["Band Gap (eV)"]),
            }
            for row in read_csv(SOURCE / "data" / "Li-MP-final.csv")
        ]
    )

    write_json("computational-preview.json", fixed_preview(computational))
    write_json("experimental.json", experimental)
    write_json("materials-project-preview.json", fixed_preview(materials))
    computational.to_parquet(
        OUTPUT / "computational.parquet", index=False, compression="zstd"
    )
    materials.to_parquet(
        OUTPUT / "materials-project.parquet", index=False, compression="zstd"
    )

    single_frame = read_prediction_pairs(EXTRACTED / "single-results.csv")
    write_json("single-substitution-preview.json", fixed_preview(single_frame))
    single_frame.to_parquet(
        OUTPUT / "single-substitution.parquet", index=False, compression="zstd"
    )

    prediction_counts: dict[str, int] = {}
    preview_pool: list[pd.DataFrame] = []
    for series in range(1, 5):
        frame = read_prediction_pairs(
            EXTRACTED / f"{series}-double-results.csv", series=series
        )
        frame.to_parquet(
            OUTPUT / f"double-substitution-{series}.parquet",
            index=False,
            compression="zstd",
        )
        preview_pool.append(frame.sample(n=100, random_state=RANDOM_SEED + series))
        prediction_counts[str(series)] = len(frame)

    double_preview = pd.concat(preview_pool, ignore_index=True).sample(
        n=100, random_state=RANDOM_SEED
    )
    write_json(
        "double-substitution-preview.json", double_preview.to_dict(orient="records")
    )
    double_count = sum(prediction_counts.values())
    write_json(
        "manifest.json",
        [
            {
                "computational": len(computational),
                "experimental": len(experimental),
                "materialsProject": len(materials),
                "predictionSeries": prediction_counts,
                "doubleSubstitutions": double_count,
                "singleSubstitutions": len(single_frame),
                "totalSubstitutions": double_count + len(single_frame),
            }
        ],
    )


if __name__ == "__main__":
    build()
