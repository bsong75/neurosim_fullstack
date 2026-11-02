# DNN+NeuroSim V1.4

The DNN+NeuroSim framework was developed by [Prof. Shimeng Yu's group](https://shimeng.ece.gatech.edu/) (Georgia Institute of Technology). The model is made publicly available on a non-commercial basis. Copyright of the model is maintained by the developers, and the model is distributed under the terms of the [Creative Commons Attribution-NonCommercial 4.0 International Public License](http://creativecommons.org/licenses/by-nc/4.0/legalcode)

:star2: This is the released version 1.4 (August 1, 2023) for the tool, and this version has **_improved following inference engine estimation_**:


If you use the tool or adapt the tool in your work or publication, you are required to cite the following reference:

* J. Lee, A. Lu, W. Li, S. Yu, ※NeuroSim V1. 4: Extending Technology Support for Digital Compute-in-Memory Toward 1nm Node, *§ IEEE Transactions on Circuits and Systems I: Regular Papers, 2024.*
https://ieeexplore.ieee.org/abstract/document/10443264?casa_token=FK98oN4tvxMAAAAA:RVAOa61R7fUYEtuAEePoMh8eJoN3E8jSZgVcaKWJq12gB04PoUieQXYBmdSGCklyPZ9QWXm6 

---

# Running experiments with Docker + results dashboard

This copy of NeuroSim adds a Docker setup and a web dashboard on top of the original tool, so you can run
experiments without installing Conda, CUDA or a C++ toolchain. The original NeuroSim documentation
continues below this section and is unchanged.

## What the tool does, in short

NeuroSim simulates a **compute-in-memory (CIM) chip**: an AI accelerator that does its math inside the
memory instead of moving weights to a separate processor. You describe a chip (memory type,
technology node, sub-array size, ADC precision, bits per cell, device noise, ...) and one run answers two
questions:

1. **Would the neural network still be accurate on this chip?** The PyTorch wrapper runs a pretrained
   model (VGG8 or DenseNet40 on CIFAR-10, ResNet18 on ImageNet) over the test set while emulating
   the chip's imperfections (ADC quantization, limited cell precision, on/off ratio, variation, drift).
2. **How good is the chip physically?** The NeuroSim C++ estimator reports chip area, latency, energy,
   leakage, TOPS/W and FPS, per layer and for the whole chip.

A run goes through four steps:

| Step | What happens |
|---|---|
| 1. Download dataset | CIFAR-10 is downloaded once into a Docker volume and reused afterwards |
| 2. Record layer data | During the first batch, each layer's inputs and weights are saved as CSV traces |
| 3. Accuracy test | All 10,000 test images run through the emulated chip (50 batches of 200) |
| 4. Chip estimate | `NeuroSIM/main` reads the traces and prints the area / latency / energy report |

## Requirements

- Docker Desktop (Windows with the WSL2 backend, or Linux)
- **An NVIDIA GPU with Docker GPU support.** CPU-only machines are not supported yet: several lines in
  `modules/quantization_cpu_np_infer.py` hard-code `device='cuda'`, and the compose service requests a GPU.
  See [Known limitations](#known-limitations).

## Quick start

```bash
cd DNN_NeuroSim_V1.4

# 1. Build both images (simulator + dashboard)
docker compose --profile sim build
docker compose build dashboard

# 2. Start the dashboard, then open http://localhost:8080
docker compose up -d dashboard

# 3. Run an experiment (arguments go straight to inference.py)
docker compose run --rm neurosim --dataset cifar10 --model VGG8 --mode WAGE --inference 1 --cellBit 1 --subArray 128
```

With no arguments, `docker compose run --rm neurosim` runs the README's VGG8 example
(`--cellBit 1 --subArray 128 --parallelRead 64`).

More examples:

```bash
# Is a cheaper 4-bit ADC good enough?
docker compose run --rm neurosim --model VGG8 --inference 1 --ADCprecision 4

# What if the memory devices are noisy?
docker compose run --rm neurosim --model VGG8 --inference 1 --vari 0.1

# DenseNet40 with 2-bit cells and a 6-bit ADC
docker compose run --rm neurosim --model DenseNet40 --inference 1 --cellBit 2 --ADCprecision 6

# Shell inside the simulator container
docker compose run --rm neurosim bash
```

Change **one setting per run** and compare against a baseline run; that is how the tradeoffs show up.

## Where results go

Each run writes its full console output (settings, accuracy and the NeuroSim hardware report) to
`results/<timestamp>_<settings>.txt`. Set `-e RUN_TAG=myname` before the service name to choose the
file name instead. Python logs go to `results/logs/`. The dashboard reads these files; you never need
to open them by hand.

## Results dashboard (http://localhost:8080)

- **Runs**: every experiment in `results/`, with its settings and headline numbers (accuracy, TOPS/W,
  chip area, latency, energy). Sort by any column; tick runs and click *Compare selected*.
- **Run detail**:
  - Live progress through the four steps, with counts, elapsed time and estimated time left.
  - Headline numbers.
  - Per-layer latency and energy, split into ADC, accumulation and other circuits.
  - Chip area by component, chip summary and the raw log.
- **Compare**: plot any setting (x-axis) against any result (y-axis), one dot per run, plus a
  side-by-side table with the best value in each column in bold.

Pages refresh automatically while a run is in progress. The dashboard only reads `results/`, so new
runs appear without restarting it.

**How progress tracking works:** `inference.py` prints timestamped `[progress]` lines (trace start, each
finished batch, NeuroSim start) and `run_experiment.sh` records the run's start and exit code. The
dashboard turns these into the step tracker. A run that exits with an error is marked *Failed* at the
step where it stopped.

## How long a run takes

Measured on an RTX 2070 Max-Q (8 GB), VGG8, `--subArray 128 --parallelRead 64`:

| Step | Time |
|---|---|
| 1. Download CIFAR-10 (first run only) | about 1.5 h; the University of Toronto server sent about 90 KB/s |
| 2. Record layer data | about 7 min |
| 3. Accuracy test | about 6 min 50 s per batch × 50 batches ≈ **5.5–6 h** |
| 4. Chip estimate | about 5–15 min (estimate) |

The accuracy test is slow by design: to emulate the hardware, every layer is computed bit by bit
(8 input bits × 8 weight bits) for every memory block and kernel position, so a single batch is tens of
thousands of GPU operations. `--parallelRead` below `--subArray` (e.g. 64 with 128) roughly doubles that.

The simulator uses one CPU core and about 1.5 GB of RAM. That is expected and not a Docker limit:
a single Python loop keeps the GPU (the real bottleneck) at about 85% busy. Increasing the batch size is
not a safe speed-up, because the ADC emulation scales by the min/max of each batch, so results would
change.

## Settings you can change

| Where | Setting | Meaning |
|---|---|---|
| command line | `--model` | `VGG8`, `DenseNet40` (CIFAR-10, pretrained weights in `log/`), `ResNet18` (ImageNet) |
| command line | `--subArray`, `--parallelRead` | memory block size; rows read at once (`parallelRead < subArray` only with `--cellBit 1`) |
| command line | `--ADCprecision`, `--cellBit`, `--onoffratio` | ADC bits, bits per memory cell, Gmax/Gmin |
| command line | `--vari`, `--t`, `--v`, `--detect`, `--target` | device variation and retention drift (affect accuracy only) |
| command line | `--wl_weight`, `--wl_activate` | weight / activation precision |
| `Inference_pytorch/NeuroSIM/Param.cpp` | `technode`, `memcelltype`, `globalBusType`, ... | technology node (130 nm – 1 nm), SRAM/RRAM/FeFET, H-tree vs X-Y bus |

The C++ estimator is compiled into the image, so **after editing `Param.cpp` (or any C++ file), rebuild**
with `docker compose --profile sim build`. Only the last layers re-run, so it takes seconds.

## What was added or changed

| File | Purpose |
|---|---|
| `Dockerfile` | Simulator image: PyTorch 2.1.2 + CUDA 12.1, g++; converts Windows line endings and compiles NeuroSim |
| `docker-compose.yml` | `neurosim` service (GPU, `sim` profile, run on demand) and `dashboard` service (port 8080) |
| `docker/run_experiment.sh` | Runs `inference.py`, saves output to `results/`, records start time and exit code |
| `dashboard/backend/` | FastAPI app; `results_parser.py` turns result files into JSON, `progress.py` computes step progress |
| `dashboard/frontend/` | Vite + React + TypeScript app (runs table, run detail with charts, compare view) |
| `Inference_pytorch/models/ResNet.py` | Import `load_state_dict_from_url` from `torch.hub` (removed from newer torchvision) |
| `Inference_pytorch/inference.py` | Prints `[progress]` lines for the dashboard; the simulation itself is unchanged |

Docker volumes: `datasets` (CIFAR downloads) and `torch-cache` (ResNet18 weights) persist across runs.
`docker compose up` on its own starts only the dashboard; the simulator runs only via `docker compose run`.

To work on the dashboard: after editing anything under `dashboard/`, run
`docker compose up -d --build dashboard`. For live frontend development,
run `cd dashboard/frontend && npm install && npm run dev` (it proxies `/api` to port 8080).

## Known limitations

- **NVIDIA GPU required.** Running on CPU (including Apple Silicon Macs) needs:
  - Code fixes for the hard-coded `device='cuda'` lines and `torch.load(..., map_location=...)` in the models.
  - A CPU-only image and compose service.

  It would also be much slower than the GPU, so it isn't practical without a quick-run option.
- **No quick-run mode yet.** Every run uses all 10,000 test images. A `--test_images` option (accuracy on a
  subset; the chip estimate only uses the first batch anyway) and removing wasted work in the
  emulation loops are planned but not implemented.
- **ImageNet / ResNet18** needs the ImageNet validation set. `models/dataset.py` expects it at
  `/home/shimeng/Documents/Data/val`; mount yours there by adding
  `- /path/to/imagenet:/home/shimeng/Documents/Data:ro` to the `neurosim` volumes in `docker-compose.yml`.
- The NeuroSim hardware estimate uses the traces from the **first batch** only; accuracy uses the full test set.

---

# Original NeuroSim documentation

## 1. Support for technology scaling down to 1nm node in the hardware estimation framework (C++ code).
```
The following is a list of the supported nodes with key features:

130nm Same as V1.3 (PTM Model)
90nm Same as V1.3 (PTM Model)
65nm Same as V1.3 (PTM Model)
45nm Same as V1.3 (PTM Model)
32nm Same as V1.3 (PTM Model)
22nm Same as V1.3 (PTM Model)
14nm FinFET, Fin number=4 (per each NMOS/PMOS)
10nm FinFET, Fin number=3 (per each NMOS/PMOS)
7nm FinFET, Fin number=2 (per each NMOS/PMOS)
5nm FinFET, Fin number=2 (per each NMOS/PMOS)
3nm FinFET, Fin number=2 (per each NMOS/PMOS)
2nm Nanosheet (GAA), Nanosheet number=3 (per each NMOS/PMOS), Backside power rail
1nm Nanosheet (GAA), Nanosheet number=4 (per each NMOS/PMOS), Backside power rail, Dielectric wall separation, CFET design for SRAM
```

### To select a technology node:
```
modify the "technnode" parameter (line 127 in Param.cpp) to match the desired case
For example technnode = 22 corresponds to a technode of 22nm and technnode = 14 corresponds to 14nm.

For additional details about the device parameters used in NeuroSim, refer to section 7 of the V1.4 manual.
```

## 2. Add partial parallel mode in python wrapper (for single-level cells only) and C++ code for hardware estimation.

### To enable partial parallel mode
```
Specify the parameter "parallelRead" when running the python wrapper.
Partial parallel mode will be enabled in both the python wrapper and C++ code.

--parallelRead N

Where N is the desired number of rows activated in parallel and N <= sub-array size.
```

## 3. XY Bus as an alternative to H-tree interconnect.

### In "Param.cpp", to switch interconnect mode:
```
globalBusType = false;		// false: X-Y Bus      // true: H-Tree
```

## Installation steps (Linux + Anaconda/Miniconda)
We recommend using anaconda package manager to install PyTorch.

This version supports the recently released PyTorch 2.0

We have currently tested the following operating systems and drivers:

(1) 
Red Hat 8.8 (Ootpa)
gcc: v8.5.0
glibc: v2.28
NVIDIA Driver Version: 535.54.03
CUDA Version: 12.2

(2)
Ubuntu 20.04
gcc: v9.4.0
glibc: v2.31
NVIDIA Driver Version: 525.60.13
CUDA Version: 12.0

### 1. Download Anaconda/Miniconda: https://docs.conda.io/en/latest/miniconda.html
### 2. Follow install instructions: https://docs.conda.io/en/latest/miniconda.html#installing

### 3. Get the tool from GitHub
```
git clone https://github.com/neurosim/DNN_NeuroSim_V1.4.git
cd DNN_NeuroSim_V1.4
```

### 4. Create a conda environment

```
conda create --name neurosim
```

### 5. Activate neurosim environment

```
conda activate neurosim
```

### 6. Download and install PyTorch packages

```
conda install pytorch torchvision torchaudio pytorch-cuda=11.7 -c pytorch -c nvidia
```

### 7. Pick a network architecture. The following have been pre-trained and provided with NeuroSim.
```
1. VGG8 on cifar10 
   8-bit "WAGE" mode pretrained model is uploaded to './log/VGG8.pth'
2. DenseNet40 on cifar10 
   8-bit "WAGE" mode pretrained model is uploaded to './log/DenseNet40.pth'
3. ResNet18 on imagenet 
   "FP" mode pretrained model is loaded from 'https://download.pytorch.org/models/resnet18-5c106cde.pth'
```

### 8. (Optional) Train the network to get the model for inference

### 9. Compile the NeuroSim C++ code
```
cd Inference_pytorch/NeuroSIM
make
```

### 10. Run Pytorch/Tensorflow wrapper (integrated with NeuroSim). The following are some examples with arguments.

```
cd ..

python inference.py --dataset cifar10 --model VGG8 --mode WAGE --inference 1 --cellBit 1 --subArray 128 --parallelRead 64
python inference.py --dataset cifar10 --model DenseNet40 --mode WAGE --inference 1 --cellBit 2 --ADCprecision 6
python inference.py --dataset imagenet --model ResNet18 --mode FP --inference 1 --onoffratio 100
```

<br/>

**_For estimation of on-chip training accelerators, please visit released V2.1 [DNN+NeuroSim V2.1](https://github.com/neurosim/DNN_NeuroSim_V2.1)_**
```
NOTE: the on-chip training framework has not yet been updated to support the features released in this version (DNN+NeuroSim V1.4).

We plan to support the technology scaling to 1nm, partial parallel mode and the XY bus in a future update.  
```
In Pytorch/Tensorflow wrapper, users are able to define **_network structures, precision of synaptic weight and neural activation_**. With the integrated NeuroSim which takes real traces from wrapper, the framework can support hierarchical organization from device level to circuit level, to chip level and to algorithm level, enabling **_instruction-accurate evaluation on both accuracy and hardware performance of inference_**.

Developers: [Junmo Lee](mailto:junmolee@gatech.edu) :two_men_holding_hands: [James Read](mailto:jread6@gatech.edu) :couple: [Anni Lu](mailto:alu75@gatech.edu) :two_women_holding_hands: [Xiaochen Peng](mailto:xpeng76@gatech.edu) :two_women_holding_hands: [Shanshi Huang](mailto:shuang406@gatech.edu).

This research is supported by NSF CAREER award, NSF/SRC E2CDA program, the ASCENT center (SRC/DARPA JUMP 1.0) and the PRISM and CHIMES centers (SRC/DARPA JUMP 2.0).

If you use the tool or adapt the tool in your work or publication, you are required to cite the following reference:

* J. Lee, A. Lu, W. Li, S. Yu, ※NeuroSim V1. 4: Extending Technology Support for Digital Compute-in-Memory Toward 1nm Node, *§ IEEE Transactions on Circuits and Systems I: Regular Papers, 2024.*
https://ieeexplore.ieee.org/abstract/document/10443264?casa_token=FK98oN4tvxMAAAAA:RVAOa61R7fUYEtuAEePoMh8eJoN3E8jSZgVcaKWJq12gB04PoUieQXYBmdSGCklyPZ9QWXm6 

If you have logistic questions or comments on the model, please contact :man: [Prof. Shimeng Yu](mailto:shimeng.yu@ece.gatech.edu), and if you have technical questions or comments, please contact :man: [Junmo Lee](mailto:junmolee@gatech.edu) or :man: [James Read](mailto:jread6@gatech.edu) or :woman: [Anni Lu](mailto:alu75@gatech.edu).


## File lists
1. Manual: `Documents/DNN NeuroSim V1.4 Manual.pdf`
2. DNN_NeuroSim wrapped by Pytorch: 'Inference_pytorch'
3. NeuroSim under Pytorch Inference: 'Inference_pytorch/NeuroSIM'



For additional details on the usage of this tool, please refer to the manual.


## References related to this tool 
1. J. Lee, A. Lu, W. Li, S. Yu, ※NeuroSim V1. 4: Extending Technology Support for Digital Compute-in-Memory Toward 1nm Node, *§ IEEE Transactions on Circuits and Systems I: Regular Papers, 2024.
2. A. Lu, X. Peng, W. Li, H. Jiang, S. Yu, ※NeuroSim simulator for compute-in-memory hardware accelerator: validation and benchmark, *§ Frontiers in Artificial Intelligence, vol. 4, 659060, 2021.
3. X. Peng, S. Huang, Y. Luo, X. Sun and S. Yu, ※DNN+NeuroSim: An End-to-End Benchmarking Framework for Compute-in-Memory Accelerators with Versatile Device Technologies, *§ IEEE International Electron Devices Meeting (IEDM)*, 2019.
4. X. Peng, R. Liu, S. Yu, ※Optimizing weight mapping and data flow for convolutional neural networks on RRAM based processing-in-memory architecture, *§ IEEE International Symposium on Circuits and Systems (ISCAS)*, 2019.
5. P.-Y. Chen, S. Yu, ※Technological benchmark of analog synaptic devices for neuro-inspired architectures, *§ IEEE Design & Test*, 2019.
6. P.-Y. Chen, X. Peng, S. Yu, ※NeuroSim: A circuit-level macro model for benchmarking neuro-inspired architectures in online learning, *§ IEEE Trans. CAD*, 2018.
7. X. Sun, S. Yin, X. Peng, R. Liu, J.-S. Seo, S. Yu, ※XNOR-RRAM: A scalable and parallel resistive synaptic architecture for binary neural networks,*§ ACM/IEEE Design, Automation & Test in Europe Conference (DATE)*, 2018.
8. P.-Y. Chen, X. Peng, S. Yu, ※NeuroSim+: An integrated device-to-algorithm framework for benchmarking synaptic devices and array architectures, *§ IEEE International Electron Devices Meeting (IEDM)*, 2017.
9. P.-Y. Chen, S. Yu, ※Partition SRAM and RRAM based synaptic arrays for neuro-inspired computing,*§ IEEE International Symposium on Circuits and Systems (ISCAS)*, 2016.
10. P.-Y. Chen, D. Kadetotad, Z. Xu, A. Mohanty, B. Lin, J. Ye, S. Vrudhula, J.-S. Seo, Y. Cao, S. Yu, ※Technology-design co-optimization of resistive cross-point array for accelerating learning algorithms on chip,*§ IEEE Design, Automation & Test in Europe (DATE)*, 2015.
11. S. Wu, et al., ※Training and inference with integers in deep neural networks,*§ arXiv: 1802.04680*, 2018.
12. github.com/boluoweifenda/WAGE
13. github.com/stevenygd/WAGE.pytorch
14. github.com/aaron-xichen/pytorch-playground
