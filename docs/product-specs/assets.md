# 자산 관리 — Product Spec

## 개요
노트북(Lease), 아이패드(iPad), 모니터(Monitor), 프린터(Printer), Teams 번호를 직원별로 추적·관리한다.

## 데이터 소스
- Google Sheets: `SPREADSHEET_ID` (config.py)
- 시트 탭: `Lease_List`, `Ipad_List`, `Monitor`, `Printer`, `TeamsNumber`, `All_User`

## 핵심 기능
- 자산 목록 조회 / 인라인 수정 / 삭제
- 신규 입사자 등록 → All_User 자동 동기화
- 퇴사자 자산 반납 처리 (자산별 또는 전체)
- 대량 이메일/이름 검색 (BulkSearch)
- 노트북/아이패드 시리얼 번호 유무 필터 (대시보드)

## 관련 파일
- `frontend/src/pages/AssetList.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/NewHire.jsx`
- `frontend/src/pages/Resign.jsx`
- `backend/routers/assets.py`
- `backend/services/assets_service.py`
