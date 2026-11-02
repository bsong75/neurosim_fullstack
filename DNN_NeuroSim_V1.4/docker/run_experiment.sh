#!/usr/bin/env bash
# Runs inference.py with the given args and saves the full output
# (accuracy + NeuroSim hardware report) to results/<timestamp>_<tag>.txt
set -euo pipefail
cd /app/Inference_pytorch

# Pass-through for ad-hoc commands, e.g. `docker compose run neurosim bash`
case "${1:-}" in
  bash|sh|python|make) exec "$@" ;;
esac

mkdir -p results/logs
tag="${RUN_TAG:-$(echo "$*" | sed -e 's/--//g' -e 's/ \+/_/g' | tr -cd '[:alnum:]_.=-')}"
out="results/$(date +%Y%m%d_%H%M%S)_${tag}.txt"

echo "Saving output to ${out}"
# [progress] lines are read by the results dashboard
echo "[progress] stage=start t=$(date +%s)" > "$out"
set +e
python inference.py --logdir results/logs "$@" 2>&1 | tee -a "$out"
code=${PIPESTATUS[0]}
echo "[progress] stage=exit code=${code} t=$(date +%s)" >> "$out"
exit "$code"
