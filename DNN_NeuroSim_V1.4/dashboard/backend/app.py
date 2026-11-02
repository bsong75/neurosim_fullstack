import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from results_parser import parse_file, tail

RESULTS_DIR = Path(os.environ.get("RESULTS_DIR", "/results"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent / "static"))

app = FastAPI(title="NeuroSim results")


def _run_path(run_id: str) -> Path:
    path = (RESULTS_DIR / f"{run_id}.txt").resolve()
    if path.parent != RESULTS_DIR.resolve() or not path.is_file():
        raise HTTPException(404, "run not found")
    return path


@app.get("/api/runs")
def list_runs():
    runs = []
    for path in sorted(RESULTS_DIR.glob("*.txt"), reverse=True):
        run = parse_file(path)
        run.pop("layers")  # keep the list payload small
        runs.append(run)
    return runs


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    return parse_file(_run_path(run_id))


@app.get("/api/runs/{run_id}/log", response_class=PlainTextResponse)
def get_log(run_id: str, lines: int = 200):
    return tail(_run_path(run_id), lines)


if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        # client-side routes all resolve to index.html
        return FileResponse(STATIC_DIR / "index.html")
