#!/bin/bash
# ==============================================================================
# ServiceNow 연동 작업 실패 시 테스트 서버 원복(Rollback) 스크립트
# ==============================================================================
set -e

echo "⚠️  ServiceNow 연동 이전 상태(checkpoint-pre-snow)로 롤백을 시작합니다..."

# 1. 작업 중인 변경사항 정리 및 체크포인트로 리셋
CURRENT_BRANCH=$(git branch --show-current)
echo "📌 현재 브랜치: $CURRENT_BRANCH"

git checkout main
git reset --hard checkpoint-pre-snow

echo "✅ 로컬 코드가 체크포인트(1261ba3)로 원복되었습니다."

# 2. GitHub 동기화 필요 여부 확인 후 배포
echo "🚀 테스트 서버(asset-info-test)로 이전 버전 재배포를 진행하시겠습니까? (y/N)"
read -r CONFIRM
if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    git push origin main --force
    ./deploy.sh test
    echo "🎉 테스트 서버가 성공적으로 이전 상태로 원복되었습니다!"
else
    echo "ℹ️  원격 배포는 건너뛰었습니다. 로컬 코드만 원복되었습니다."
fi
