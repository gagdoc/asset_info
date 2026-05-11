# ── Stage 1: Build React Frontend ────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --include=dev

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Final Image (FastAPI + 빌드된 React) ────
# python:3.11-slim 사용 (불필요한 시스템 패키지 제거로 크기 최소화)
FROM python:3.11-slim

WORKDIR /app

# build-essential 제거: 모든 Python 패키지가 순수 Python이므로 C 컴파일러 불필요
# apt 캐시를 같은 RUN 레이어에서 정리하여 이미지 크기 절약
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# pip 업그레이드 + 의존성 설치를 하나의 레이어로 합산
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# 애플리케이션 소스 복사 (변경 빈도 높은 것을 마지막에)
COPY config.py .
COPY template.xlsx .
COPY backend/ backend/

# Stage 1에서 빌드된 React 정적 파일만 복사 (node_modules 제외)
COPY --from=frontend-build /app/frontend/dist frontend/dist

# Cloud Run은 PORT 환경변수를 자동으로 주입합니다
ENV PORT=8080
EXPOSE $PORT

CMD uvicorn backend.main:app --host 0.0.0.0 --port $PORT
