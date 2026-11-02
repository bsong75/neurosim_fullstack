# Running DNN+NeuroSim V1.4 in Docker

Requirements: Docker Desktop with NVIDIA GPU support (WSL2 backend). Several code paths
hardcode `cuda`, so run with a GPU.

## Build

```bash
docker compose build
```

The image compiles `Inference_pytorch/NeuroSIM/main` at build time. **If you edit any C++
file (e.g. `Param.cpp` to change `technode`, `memcelltype`, `globalBusType`), rebuild.** Only
the last layers re-run, so it takes a few seconds.

## Run an experiment

Arguments after the service name go straight to `inference.py`:

```bash
# default (VGG8 / CIFAR-10 / WAGE, 1-bit cell, 128x128 subarray, 64-row partial parallel)
docker compose run --rm neurosim

docker compose run --rm neurosim --dataset cifar10 --model VGG8 --mode WAGE --inference 1 --cellBit 1 --subArray 128 --parallelRead 64
docker compose run --rm neurosim --dataset cifar10 --model DenseNet40 --mode WAGE --inference 1 --cellBit 2 --ADCprecision 6
docker compose run --rm neurosim --dataset cifar10 --model VGG8 --inference 1 --vari 0.1 --onoffratio 100
```

Each run writes its full console output (accuracy + NeuroSim area/latency/energy report) to
`results/<timestamp>_<args>.txt`. Set `-e RUN_TAG=myname` to choose the file name instead.
Python logs go to `results/logs/`.

Interactive shell: `docker compose run --rm neurosim bash`

## Results dashboard

```bash
docker compose up -d dashboard      # then open http://localhost:8080
```

- **Runs**: every file in `results/`, with its settings and headline numbers. Sort by any column, tick runs and click *Compare selected*.
- **Run detail**: accuracy, TOPS/W, area, latency, energy; per-layer latency/energy split by circuit block; area by component; raw log. Pages refresh automatically while a run is still going.
- **Compare**: plot any setting (x) against any result (y), one dot per run, plus a side-by-side table.

The dashboard only reads `results/`, so new runs show up without restarting it. After editing
anything under `dashboard/`, run `docker compose up -d --build dashboard`. For live frontend
development: `cd dashboard/frontend && npm install && npm run dev` (proxies `/api` to port 8080).

## Key knobs

| Where | Parameter | Meaning |
|---|---|---|
| CLI | `--model` | `VGG8`, `DenseNet40` (CIFAR-10, pretrained weights in `log/`), `ResNet18` (ImageNet) |
| CLI | `--subArray`, `--parallelRead` | crossbar size; rows read at once (`parallelRead < subArray` only works with `cellBit 1`) |
| CLI | `--ADCprecision`, `--cellBit`, `--onoffratio` | ADC bits, bits per cell, Gmax/Gmin |
| CLI | `--vari`, `--t`, `--v`, `--detect`, `--target` | device variation and retention drift (accuracy only) |
| CLI | `--wl_weight`, `--wl_activate` | weight / activation precision |
| `NeuroSIM/Param.cpp` | `technode`, `memcelltype`, `globalBusType`, ... | technology node (130nm–1nm), SRAM/RRAM/FeFET, H-tree vs XY bus (rebuild needed) |

## Notes

- CIFAR-10 is downloaded on the first run into the `datasets` Docker volume and reused afterwards.
  The source server is slow (~100 KB/s), so the first run can take ~30 min.
- ImageNet/ResNet18 needs the ImageNet val set. `models/dataset.py` expects it at
  `/home/shimeng/Documents/Data/val`. Mount yours there (add
  `- /path/to/imagenet:/home/shimeng/Documents/Data:ro` to `volumes` in `docker-compose.yml`).
- Only the first test batch is traced for NeuroSim. Accuracy is measured on the full test set.
