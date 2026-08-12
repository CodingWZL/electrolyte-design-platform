"""Export the published IonNet ensemble and elemental descriptor data for the browser."""

from __future__ import annotations

import gzip
import io
import json
import pickle
import sys
import types
import zipfile
from collections import OrderedDict
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "IonNet-source"
MATMINER = SOURCE / ".tooling" / "matminer-wheel" / "matminer" / "utils" / "data_files"
OUTPUT = ROOT / "deploy" / "public" / "data" / "ionnet"

MAGPIE_PROPERTIES = [
    "Number", "MendeleevNumber", "AtomicWeight", "MeltingT", "Column", "Row",
    "CovalentRadius", "Electronegativity", "NsValence", "NpValence", "NdValence",
    "NfValence", "NValence", "NsUnfilled", "NpUnfilled", "NdUnfilled",
    "NfUnfilled", "NUnfilled", "GSvolume_pa", "GSbandgap", "GSmagmom",
    "SpaceGroupNumber", "AtomicRadius",
]

SYMBOLS = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al",
    "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe",
    "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y",
    "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te",
    "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb",
    "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt",
    "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa",
    "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
]


def clean_number(value: float) -> float | None:
    return round(float(value), 8) if np.isfinite(value) else None


def read_property(name: str) -> list[float | None]:
    lines = (MATMINER / "magpie_elementdata" / f"{name}.table").read_text().splitlines()
    values = []
    for index in range(103):
        try:
            values.append(clean_number(float(lines[index])))
        except (IndexError, ValueError):
            values.append(None)
    return values


def descriptor_payload() -> dict[str, object]:
    properties = {name: read_property(name) for name in MAGPIE_PROPERTIES}
    embeddings = json.loads(
        (MATMINER / "megnet_elemental_embedding.json").read_text(encoding="utf-8")
    )
    megnet = []
    for atomic_number in range(1, 104):
        source_index = atomic_number if atomic_number < len(embeddings) else 0
        megnet.append([clean_number(value) for value in embeddings[source_index]])
    return {
        "symbols": SYMBOLS,
        "magpieProperties": MAGPIE_PROPERTIES,
        "magpie": [[properties[name][z] for name in MAGPIE_PROPERTIES] for z in range(103)],
        "megnet": megnet,
    }


class Storage:
    def __init__(self, values: np.ndarray):
        self.values = values


class TorchArchiveUnpickler(pickle.Unpickler):
    def __init__(self, handle: io.BytesIO, archive: zipfile.ZipFile, prefix: str):
        super().__init__(handle)
        self.archive = archive
        self.prefix = prefix

    def find_class(self, module: str, name: str):
        if module == "collections" and name == "OrderedDict":
            return OrderedDict
        if module == "torch._utils" and name.startswith("_rebuild_tensor"):
            return rebuild_tensor
        if module == "torch" and name.endswith("Storage"):
            return name
        return super().find_class(module, name)

    def persistent_load(self, identifier):
        _, storage_type, key, _, _ = identifier
        dtype = np.float32 if storage_type == "FloatStorage" else np.float64
        raw = self.archive.read(f"{self.prefix}/data/{key}")
        return Storage(np.frombuffer(raw, dtype=dtype))


def rebuild_tensor(storage: Storage, offset: int, size, stride, *_) -> np.ndarray:
    item_size = storage.values.dtype.itemsize
    return np.ndarray(
        shape=tuple(size),
        dtype=storage.values.dtype,
        buffer=storage.values,
        offset=offset * item_size,
        strides=tuple(value * item_size for value in stride),
    ).copy()


def load_state_dict(path: Path) -> OrderedDict[str, np.ndarray]:
    with zipfile.ZipFile(path) as archive:
        pkl_name = next(name for name in archive.namelist() if name.endswith("/data.pkl"))
        prefix = pkl_name.rsplit("/", 1)[0]
        handle = io.BytesIO(archive.read(pkl_name))
        return TorchArchiveUnpickler(handle, archive, prefix).load()


def tensor(state: OrderedDict[str, np.ndarray], name: str) -> object:
    return np.asarray(state[name], dtype=np.float32).round(8).tolist()


def branch_payload(state: OrderedDict[str, np.ndarray], prefix: str) -> dict[str, object]:
    in_weight = np.asarray(state[f"{prefix}.attention.in_proj_weight"], dtype=np.float32)
    in_bias = np.asarray(state[f"{prefix}.attention.in_proj_bias"], dtype=np.float32)
    return {
        "fc1w": tensor(state, f"{prefix}.fc1.weight"),
        "fc1b": tensor(state, f"{prefix}.fc1.bias"),
        "fc2w": tensor(state, f"{prefix}.fc2.weight"),
        "fc2b": tensor(state, f"{prefix}.fc2.bias"),
        "fc3w": tensor(state, f"{prefix}.fc3.weight"),
        "fc3b": tensor(state, f"{prefix}.fc3.bias"),
        "valuew": tensor(state, f"{prefix}.value.weight"),
        "valueb": tensor(state, f"{prefix}.value.bias"),
        "mhaValueW": in_weight[32:48].round(8).tolist(),
        "mhaValueB": in_bias[32:48].round(8).tolist(),
        "outw": tensor(state, f"{prefix}.attention.out_proj.weight"),
        "outb": tensor(state, f"{prefix}.attention.out_proj.bias"),
    }


def model_payload(path: Path) -> dict[str, object]:
    state = load_state_dict(path)
    return {
        "weights": [float(np.asarray(state[f"weight{index}"])) for index in range(1, 4)],
        "branches": [branch_payload(state, f"attn{index}") for index in range(1, 4)],
        "fcw": tensor(state, "fc.weight"),
        "fcb": tensor(state, "fc.bias"),
    }


def write_gzip_json(name: str, payload: object) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()
    (OUTPUT / name).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))


def build() -> None:
    models = [
        model_payload(SOURCE / "trained_models" / "experiment" / f"fine_tuned_model{index}.pth")
        for index in range(1, 11)
    ]
    write_gzip_json("ionnet-model.json.gz", {"descriptor": descriptor_payload(), "models": models})


if __name__ == "__main__":
    build()
