"""Parse a run_experiment output file (inference.py + NeuroSIM/main stdout) into a dict."""
import calendar
import re
import time
from pathlib import Path

import progress

NUM = r"([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)"

# Settings shown in the UI; everything else in FLAGS is training-only noise
PARAM_KEYS = [
    "model", "dataset", "mode", "subArray", "parallelRead", "ADCprecision", "cellBit",
    "onoffratio", "vari", "t", "v", "detect", "target", "wl_weight", "wl_activate",
]

SUMMARY_PATTERNS = {
    "chipArea_um2": r"^ChipArea : " + NUM,
    "areaArray_um2": r"^Chip total CIM array : " + NUM,
    "areaIC_um2": r"^Total IC Area on chip.*?: " + NUM,
    "areaADC_um2": r"^Total ADC .*?Area on chip : " + NUM,
    "areaAccum_um2": r"^Total Accumulation Circuits .*? on chip : " + NUM,
    "areaOther_um2": r"^Other Peripheries .*? : " + NUM,
    "clockPeriod_ns": r"^Chip clock period is: " + NUM,
    "readLatency_ns": r"^Chip (?:layer-by-layer readLatency|pipeline-system-clock-cycle) \(per image\) is: " + NUM,
    "readDynamicEnergy_pJ": r"^Chip (?:total|pipeline-system) readDynamicEnergy(?: \(per image\))? is: " + NUM,
    "leakageEnergy_pJ": r"^Chip (?:total|pipeline-system) leakage Energy(?: \(per image\))? is: " + NUM,
    "leakagePower_uW": r"^Chip (?:total|pipeline-system) leakage Power(?: \(per image\))? is: " + NUM,
    "bufferLatency_ns": r"^Chip (?:pipeline-system )?buffer readLatency(?: \(per image\))? is: " + NUM,
    "bufferEnergy_pJ": r"^Chip (?:pipeline-system )?buffer readDynamicEnergy(?: \(per image\))? is: " + NUM,
    "icLatency_ns": r"^Chip (?:pipeline-system )?ic readLatency(?: \(per image\))? is: " + NUM,
    "icEnergy_pJ": r"^Chip (?:pipeline-system )?ic readDynamicEnergy(?: \(per image\))? is: " + NUM,
    "tops_per_w": r"^Energy Efficiency TOPS/W \(.*?\): " + NUM,
    "tops": r"^Throughput TOPS \(.*?\): " + NUM,
    "fps": r"^Throughput FPS \(.*?\): " + NUM,
    "tops_per_mm2": r"^Compute efficiency TOPS/mm\^2 \(.*?\): " + NUM,
    "memoryUtilization_pct": r"^Memory Utilization of Whole Chip: " + NUM,
    "neurosimRuntime_s": r"^Total Run-time of NeuroSim: " + NUM,
}

LAYER_PATTERNS = {
    "readLatency_ns": r"^layer(\d+)'s readLatency is: " + NUM,
    "readDynamicEnergy_pJ": r"^layer(\d+)'s readDynamicEnergy is: " + NUM,
    "leakagePower_uW": r"^layer(\d+)'s leakagePower is: " + NUM,
    "leakageEnergy_pJ": r"^layer(\d+)'s leakageEnergy is: " + NUM,
    "bufferLatency_ns": r"^layer(\d+)'s buffer latency is: " + NUM,
    "bufferEnergy_pJ": r"^layer(\d+)'s buffer readDynamicEnergy is: " + NUM,
    "icLatency_ns": r"^layer(\d+)'s ic latency is: " + NUM,
    "icEnergy_pJ": r"^layer(\d+)'s ic readDynamicEnergy is: " + NUM,
}

# Floorplan sections list "layerN: value" under a header
FLOORPLAN_SECTIONS = {
    "# of tile used for each layer": "tiles",
    "Speed-up of each layer": "speedUp",
    "Utilization of each layer": "utilization",
}

# "----------- ADC (...) readLatency is : 12ns" -> (ADC, latency_ns)
BREAKDOWN_RE = re.compile(
    r"^-+ (ADC|Accumulation Circuits|Other Peripheries).*? read(Latency|DynamicEnergy) is : " + NUM
)
BREAKDOWN_KEY = {"ADC": "adc", "Accumulation Circuits": "accum", "Other Peripheries": "other"}

ACC_RE = re.compile(r"Test set: Average loss: " + NUM + r", Accuracy: (\d+)/(\d+)")
LAYER_HDR_RE = re.compile(r"Estimation of Layer (\d+)")

# A run whose file hasn't changed in this long and has no final marker is treated as failed
STALE_SECONDS = 3 * 3600


def _clean_lines(text: str):
    # tqdm progress bars use carriage returns; keep only the final state of each line
    for raw in text.split("\n"):
        line = raw.split("\r")[-1].strip()
        if line:
            yield line


def _coerce(v: str):
    for cast in (int, float):
        try:
            return cast(v)
        except ValueError:
            pass
    return v


def parse_file(path: Path) -> dict:
    text = path.read_text(errors="replace")
    params, summary, layers = {}, {}, {}
    breakdown = {"chip": {}}
    section = None  # None | "flags" | floorplan key | "layer" | "summary"
    current_layer = None
    stage = "starting"

    def layer(n):
        return layers.setdefault(n, {"layer": n})

    lines = list(_clean_lines(text))
    for line in lines:
        if line.startswith("[progress]"):
            continue
        if "=====FLAGS=====" in line:
            section = "flags"
            continue
        if section == "flags":
            if line.startswith("====="):
                section = None
            elif ": " in line:
                k, v = line.split(": ", 1)
                if k in PARAM_KEYS:
                    params[k] = _coerce(v)
            continue

        if line.startswith("Downloading "):
            stage = "downloading dataset"
        elif line.startswith("Files already downloaded") or line.startswith("fan_in"):
            stage = "running inference"
        elif line.startswith("quantize layer"):
            stage = "tracing layers"
        elif (m := ACC_RE.search(line)):
            summary["testLoss"] = float(m.group(1))
            summary["correct"] = int(m.group(2))
            summary["total"] = int(m.group(3))
            summary["accuracy_pct"] = 100.0 * int(m.group(2)) / int(m.group(3))
            stage = "running NeuroSim"
            continue

        for hdr, key in FLOORPLAN_SECTIONS.items():
            if hdr in line:
                section = key
                break
        else:
            if (m := LAYER_HDR_RE.search(line)):
                section, current_layer = "layer", int(m.group(1))
                continue
            if "------ Summary ------" in line:
                section, current_layer = "summary", None
                continue

            if section in FLOORPLAN_SECTIONS.values():
                m = re.match(r"^layer(\d+): " + NUM, line)
                if m:
                    layer(int(m.group(1)))[section] = float(m.group(2))
                    continue

            m = BREAKDOWN_RE.match(line)
            if m:
                part = BREAKDOWN_KEY[m.group(1)]
                kind = "latency_ns" if m.group(2) == "Latency" else "energy_pJ"
                target = layer(current_layer) if section == "layer" and current_layer else breakdown["chip"]
                target.setdefault("breakdown", {}).setdefault(part, {})[kind] = float(m.group(3))
                continue

            matched = False
            for key, pat in LAYER_PATTERNS.items():
                m = re.match(pat, line)
                if m:
                    layer(int(m.group(1)))[key] = float(m.group(2))
                    matched = True
                    break
            if matched:
                continue

            for key, pat in SUMMARY_PATTERNS.items():
                m = re.match(pat, line)
                if m:
                    summary[key] = float(m.group(1))
                    break

    now = time.time()
    has_runtime = "Total Run-time of NeuroSim" in text
    n_floorplan = sum(1 for l in layers.values() if "tiles" in l)
    prog = progress.compute(lines, now, n_floorplan, has_runtime)

    if has_runtime:
        status = "complete"
        stage = "done"
    elif prog["status"] == "failed":
        status = "failed"
        stage = f"exited with code {prog['exitCode']}" if prog["exitCode"] else "NeuroSim did not finish"
    elif "Traceback (most recent call last)" in text or "ERROR!" in text:
        status = "failed"
    elif now - path.stat().st_mtime > STALE_SECONDS:
        status = "failed"
        stage = "stopped without finishing"
    else:
        status = "running"

    if status == "failed":
        for s in prog["stages"]:
            if s["state"] in ("active", "unknown"):
                s["state"] = "failed"
                s["etaSeconds"] = None
                break
    elif prog["current"]:
        stage = next(s["label"] for s in prog["stages"] if s["key"] == prog["current"]).lower()
    prog.pop("status")
    prog["serverTime"] = now

    return {
        "id": path.stem,
        "file": path.name,
        "startedAt": _started_at(path),
        "modifiedAt": path.stat().st_mtime,
        "status": status,
        "stage": stage,
        "params": params,
        "summary": summary,
        "chipBreakdown": breakdown["chip"].get("breakdown", {}),
        "layers": [layers[k] for k in sorted(layers)],
        "progress": prog,
    }


def _started_at(path: Path):
    m = re.match(r"(\d{8})_(\d{6})", path.stem)
    if not m:
        return path.stat().st_mtime
    # run_experiment stamps file names with the container clock (UTC)
    return calendar.timegm(time.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S"))


def tail(path: Path, n_lines: int = 200) -> str:
    lines = list(_clean_lines(path.read_text(errors="replace")))
    return "\n".join(lines[-n_lines:])
