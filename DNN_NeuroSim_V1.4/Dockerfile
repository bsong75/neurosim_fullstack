# DNN+NeuroSim V1.4 — PyTorch wrapper + NeuroSim C++ hardware estimator
FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends g++ make \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/Inference_pytorch
COPY Inference_pytorch/ /app/Inference_pytorch/
COPY docker/run_experiment.sh /usr/local/bin/run_experiment

# Sources were checked out on Windows: strip CRLF so make/bash behave, then build NeuroSim
RUN find /app /usr/local/bin/run_experiment -type f \
      \( -name '*.cpp' -o -name '*.h' -o -name '*.py' -o -name '*.csv' -o -name 'makefile' -o -name '.depend' -o -name 'run_experiment' \) \
      -exec sed -i 's/\r$//' {} + \
 && chmod +x /usr/local/bin/run_experiment \
 && find /app -name '__pycache__' -type d -prune -exec rm -rf {} + \
 && make -C NeuroSIM -j"$(nproc)"

# CIFAR datasets download here; torch hub (ResNet18 weights) caches under TORCH_HOME
ENV TORCH_HOME=/cache/torch \
    PYTHONUNBUFFERED=1
VOLUME ["/tmp/public_dataset", "/cache/torch", "/app/Inference_pytorch/results"]

ENTRYPOINT ["run_experiment"]
CMD ["--dataset", "cifar10", "--model", "VGG8", "--mode", "WAGE", "--inference", "1", "--cellBit", "1", "--subArray", "128", "--parallelRead", "64"]
