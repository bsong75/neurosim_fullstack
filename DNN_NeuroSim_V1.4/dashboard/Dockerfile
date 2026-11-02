# Stage 1: build the React app
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI serves the API and the built app
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist ./static
ENV RESULTS_DIR=/results
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
