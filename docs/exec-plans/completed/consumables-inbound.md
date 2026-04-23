# [Completed] 소모품 입고이력 & 입출고 현황

## 완료일
2026-04-23

## 구현 내용
- 소모품 입고 기록 CRUD (`입고이력` 시트)
- 품목별 월별 입출고 통합 현황 리포트
- Consumables.jsx에 "입출고 현황" 탭 추가

## 구현 파일
- `backend/routers/consumables.py` — `/inbound`, `/inventory-report` 엔드포인트
- `backend/services/consumables_service.py` — `get_inbound_history`, `add_inbound`, `update_inbound`, `delete_inbound`, `get_inventory_report`
- `frontend/src/pages/Consumables.jsx` — 입출고 현황 탭

## 커밋
- `feat: 소모품 입고이력 관리 및 재고 입출고 현황 리포트 기능 추가`

## 주의사항
- 입고이력 시트는 소모품 마스터 Spreadsheet 내에 위치
- 시트 없을 시 자동 생성 로직 포함
