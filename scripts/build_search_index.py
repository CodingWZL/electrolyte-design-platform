"""Build a row-group sorted Parquet index for fast browser-side filtering."""
from pathlib import Path

import json
import re
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[0] / "source-scan" / "app"
OUTPUT = ROOT / "public" / "data" / "atlas"


def main() -> None:
    frames = [pd.read_parquet(SOURCE / f"data_part_{part}.parquet") for part in (1, 2, 3)]
    atlas = pd.concat(frames, ignore_index=True)
    atlas = atlas.sort_values(
        ["Li-salt", "solvent_1", "solvent_2", "T", "concentration"],
        kind="stable",
    )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    total_size = 0
    for salt, partition in atlas.groupby("Li-salt", sort=False):
        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", salt).strip("_")
        path = OUTPUT / f"{safe_name}.parquet"
        table = pa.Table.from_pandas(partition, preserve_index=False)
        pq.write_table(
            table,
            path,
            compression="zstd",
            compression_level=9,
            use_dictionary=True,
            write_statistics=True,
            row_group_size=20_000,
        )
        manifest[salt] = path.name
        total_size += path.stat().st_size
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"{len(atlas):,} rows -> {len(manifest)} partitions ({total_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
