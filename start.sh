#!/bin/bash
# 백엔드 + 프론트엔드 동시 실행
# 사용법: ./start.sh

# Ctrl+C 시 두 프로세스 모두 종료
trap 'kill 0' EXIT

echo "🚀 백엔드 시작 (http://localhost:8000)"
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 &

echo "⚡ 프론트엔드 시작 (http://localhost:5173)"
cd frontend && npm run dev &

wait
