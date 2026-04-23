# 기술 부채 트래커

## 🔴 높음

| 항목 | 설명 | 관련 파일 |
|------|------|-----------|
| `database.py` 레거시 | SQLite 핸들러가 남아 있으나 신규 기능에서 미사용. 완전 제거 또는 명시적 deprecated 처리 필요 | `backend/services/database.py` |
| `*.db` 파일 | 로컬에 SQLite 파일 잔존. 실제 데이터 없음 확인 후 삭제 | `asset_database.db`, `consumables.db` |

## 🟡 중간

| 항목 | 설명 | 관련 파일 |
|------|------|-----------|
| 캐시 전략 미통일 | 대시보드는 메모리 캐시 60초, 나머지 API는 캐시 없음. 일관된 캐시 레이어 도입 고려 | `routers/assets.py` |
| 프론트엔드 상태 관리 | 각 페이지가 로컬 useState로 데이터 관리. React Query 또는 Zustand 도입 검토 | `pages/*.jsx` |
| 에러 핸들링 | API 에러 응답 포맷 비일관. 표준 에러 스키마 정의 필요 | `routers/*.py` |

## 🟢 낮음

| 항목 | 설명 | 관련 파일 |
|------|------|-----------|
| `.archive/` 폴더 | 오래된 스크립트 보관. 정기적으로 정리 필요 | `.archive/` |
| `DEVELOPMENT_GUIDE.md` | `ARCHITECTURE.md`와 내용 중복. 통합 또는 역할 재정의 필요 | `DEVELOPMENT_GUIDE.md` |
