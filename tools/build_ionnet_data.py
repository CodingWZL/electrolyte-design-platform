"""Build browser-ready IonNet datasets from the published repository files."""

from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "IonNet-source"
OUTPUT = ROOT / "deploy" / "public" / "data" / "ionnet"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_json(name: str, records: list[dict[str, object]]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with (OUTPUT / name).open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(records, handle, ensure_ascii=False, separators=(",", ":"))


def write_gzip_json(name: str, records: list[dict[str, object]]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).encode()
    (OUTPUT / name).write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))


def build() -> None:
    computational = [
        {"formula": row["formula"], "sic": float(row["SIC"])}
        for row in read_csv(SOURCE / "data" / "Li-IonML-Computations.csv")
    ]
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
        for row in read_csv(
            SOURCE / "data" / "LiIonDatabase-Experiments-300K.csv"
        )
    ]
    materials = [
        {
            "mpId": row["MP ID"],
            "formula": row["Formula"],
            "energyAboveHull": float(row["Energy Above Hull (eV)"]),
            "bandGap": float(row["Band Gap (eV)"]),
        }
        for row in read_csv(SOURCE / "data" / "Li-MP-final.csv")
    ]

    write_json("computational.json", computational)
    write_json("experimental.json", experimental)
    write_json("materials-project.json", materials)

    prediction_counts: dict[str, int] = {}
    for series in range(1, 5):
        path = SOURCE / "predictions" / f"{series}-double-candidate.csv"
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.reader(handle))
        predictions: list[dict[str, object]] = []
        for index in range(2, len(rows) - 1, 2):
            formula_row = rows[index]
            value_row = rows[index + 1]
            if len(formula_row) < 3 or len(value_row) < 3:
                continue
            try:
                predictions.append(
                    {
                        "mpId": formula_row[0],
                        "parent": formula_row[1],
                        "candidate": formula_row[2],
                        "pSigma": float(value_row[1]),
                        "uncertainty": float(value_row[2]),
                    }
                )
            except ValueError:
                continue
        predictions.sort(key=lambda item: (item["pSigma"], item["uncertainty"]))
        write_gzip_json(f"predictions-{series}.json.gz", predictions)
        prediction_counts[str(series)] = len(predictions)

    write_json(
        "manifest.json",
        [
            {
                "computational": len(computational),
                "experimental": len(experimental),
                "materialsProject": len(materials),
                "predictionSeries": prediction_counts,
                "predictions": sum(prediction_counts.values()),
            }
        ],
    )


if __name__ == "__main__":
    build()
