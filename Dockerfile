# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build FastAPI Backend & Serve
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ backend/
COPY common/ common/
COPY config.py .

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist frontend/dist

# Expose port (Cloud Run sets PORT env var)
ENV PORT=8080
EXPOSE $PORT

# Command to run standard uvicorn
CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
