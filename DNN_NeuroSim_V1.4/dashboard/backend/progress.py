"""Work out how far a run has got, from the [progress] markers and the tool's own output.

Runs started before the markers were added still get coarse progress; stages with no
evidence are reported as "unknown" rather than guessed.
"""
import re

PROGRESS_RE = re.compile(r"^\[progress\] (.*)$")
# torchvision's download bar: " 33%|███▎      | 57049088/170498071 [1:09:49<20:35, 91818.42it/s]"
TQDM_RE = re.compile(r"(\d+)%\|.*?\[([\d:]+)<([\d:?]+)")
LAYER_HDR_RE = re.compile(r"Estimation of Layer (\d+)")

STAGES = [
    ("download", "Download dataset"),
    ("trace", "Record layer data"),
    ("inference", "Accuracy test"),
    ("neurosim", "Chip estimate"),
]


def _seconds(hms: str):
    if "?" in hms:
        return None
    total = 0
    for part in hms.split(":"):
        total = total * 60 + int(part)
    return total


def _marker(line: str):
    m = PROGRESS_RE.match(line)
    if not m:
        return None
    out = {}
    for part in m.group(1).split():
        if "=" in part:
            k, v = part.split("=", 1)
            try:
                out[k] = float(v) if "." in v else int(v)
            except ValueError:
                out[k] = v
    return out


def _eta(elapsed, done, total):
    if not done or total is None or elapsed is None:
        return None
    return max(0.0, elapsed / done * (total - done))


def compute(lines, now: float, n_floorplan_layers: int, has_runtime: bool):
    marks, run_start, exit_code, exit_t = {}, None, None, None
    downloading = download_done = summary_seen = False
    trace_done = neurosim_layer = 0
    tqdm = None

    for line in lines:
        mk = _marker(line)
        if mk:
            stage = mk.get("stage")
            if stage == "start":
                run_start = mk.get("t")
            elif stage == "exit":
                exit_code, exit_t = mk.get("code"), mk.get("t")
            else:
                marks.setdefault(stage, []).append(mk)
            continue
        if line.startswith("Downloading "):
            downloading = True
        elif line.startswith("Extracting ") or line.startswith("Files already downloaded"):
            download_done = True
        elif line.startswith("quantize layer"):
            trace_done += 1
        elif "------ Summary ------" in line:
            summary_seen = True
        elif (m := LAYER_HDR_RE.search(line)):
            neurosim_layer = int(m.group(1))
        elif downloading and not download_done and (m := TQDM_RE.search(line)):
            tqdm = (int(m.group(1)), _seconds(m.group(2)), _seconds(m.group(3)))

    live = run_start is not None
    stages = {k: {"key": k, "label": label, "state": "pending", "done": None, "total": None,
                  "unit": None, "startedAt": None, "endedAt": None, "etaSeconds": None}
              for k, label in STAGES}

    # --- download ---
    d = stages["download"]
    d["startedAt"] = run_start
    if tqdm and not download_done:
        d["done"], d["total"], d["unit"] = tqdm[0], 100, "%"
        d["etaSeconds"] = tqdm[2]

    # --- trace (happens inside the first batch's forward pass) ---
    trace_mark = (marks.get("trace") or [None])[0]
    inf_marks = marks.get("inference") or []
    t = stages["trace"]
    if trace_mark:
        t["startedAt"] = trace_mark.get("t")
        t["total"] = trace_mark.get("total")
    t["done"] = trace_done if (trace_mark or trace_done) else None
    t["unit"] = "layers"
    if t["total"] is None and n_floorplan_layers:
        t["total"] = n_floorplan_layers
    if trace_mark and not inf_marks:
        t["etaSeconds"] = _eta(now - t["startedAt"], trace_done, t["total"])
    if inf_marks:
        t["endedAt"] = inf_marks[0].get("t")
        t["done"] = t["total"]

    # --- inference (batch 1 includes tracing, so the rate uses batches 2..n) ---
    i = stages["inference"]
    i["unit"] = "batches"
    if inf_marks:
        last = inf_marks[-1]
        i["startedAt"] = inf_marks[0].get("t")
        i["done"], i["total"] = last.get("done"), last.get("total")
        if len(inf_marks) >= 2 and i["done"] < i["total"]:
            per_batch = (last["t"] - inf_marks[0]["t"]) / (len(inf_marks) - 1)
            i["etaSeconds"] = max(0.0, per_batch * (i["total"] - i["done"]) - (now - last["t"]))

    # --- neurosim ---
    n = stages["neurosim"]
    n["unit"] = "layers"
    ns_mark = (marks.get("neurosim") or [None])[0]
    n["total"] = n_floorplan_layers or t["total"]
    if ns_mark:
        n["startedAt"] = ns_mark.get("t")
        i["endedAt"] = ns_mark.get("t")
    if neurosim_layer or summary_seen:
        n["done"] = n["total"] if summary_seen else max(neurosim_layer - 1, 0)
        if ns_mark and not has_runtime:
            n["etaSeconds"] = _eta(now - n["startedAt"], n["done"], n["total"])
    if exit_t is not None:
        n["endedAt"] = exit_t
    if d["startedAt"] is not None:
        d["endedAt"] = t["startedAt"]

    # --- which stage are we in? ---
    evidence = {
        "download": downloading or download_done or live,
        "trace": bool(trace_mark or trace_done),
        "inference": bool(inf_marks),
        "neurosim": bool(ns_mark or neurosim_layer or summary_seen or has_runtime),
    }
    reached = [k for k, _ in STAGES if evidence[k]]
    current = reached[-1] if reached else "download"
    if current == "download" and download_done and not live:
        current = None  # old run: output is buffered, so the real stage can't be seen yet
    if current == "download" and download_done:
        current = "trace"

    if exit_code is not None:
        status = "complete" if exit_code == 0 and has_runtime else "failed"
    else:
        status = None  # caller decides (legacy runs)

    order = [k for k, _ in STAGES]
    cur_idx = order.index(current) if current else order.index("download") + 1
    for idx, key in enumerate(order):
        s = stages[key]
        if has_runtime or idx < cur_idx:
            s["state"] = "done"
            s["etaSeconds"] = None
        elif current is None:
            s["state"] = "unknown"
        elif idx == cur_idx:
            s["state"] = "active"

    return {
        "live": live,
        "current": current,
        "stages": [stages[k] for k in order],
        "startedAt": run_start,
        "endedAt": exit_t,
        "exitCode": exit_code,
        "status": status,
    }
