# [Active] 전체 데이터 Excel 내보내기 기능

> 스펙 상세: `docs/product-specs/export.md`

## 작업 목표
대시보드 상단에 체크박스 UI를 추가하고, 선택한 항목을 시트별로 구분한 Excel 파일로 다운로드하는 기능 구현.

## 구현 순서

### Step 1. 백엔드 API
- [ ] `backend/services/assets_service.py` — `export_sheets_to_excel(sheet_keys: list)` 함수
  - 각 sheet_key → Google Sheets 데이터 읽기
  - openpyxl로 workbook 생성, 시트별 데이터 기록
  - BytesIO 스트림 반환
- [ ] `backend/routers/assets.py` — `GET /api/assets/export` 엔드포인트
  - `sheets` query param 파싱 (콤마 구분)
  - StreamingResponse로 xlsx 반환

### Step 2. 프론트엔드 UI
- [ ] `frontend/src/pages/Dashboard.jsx` 상단에 내보내기 패널 추가
  - 체크박스 7개 (항목별)
  - "전체 선택" 토글 버튼
  - "Excel 내보내기" 버튼 (선택 0개면 비활성)
- [ ] Axios로 API 호출 → blob 응답 → 파일 저장

### Step 3. 검증
- [ ] 각 항목 개별 선택 후 다운로드 확인
- [ ] 전체 선택 후 다운로드 — 시트 7개 확인
- [ ] 빈 시트(데이터 없음) 처리 확인

## 참고 패턴
견적서 Excel 다운로드 구현 참고:
- `backend/routers/consumables.py` → `@router.get("/estimate/download")`
- `backend/services/consumables_service.py` → `generate_estimate_excel()`
