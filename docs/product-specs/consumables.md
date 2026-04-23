# 소모품 관리 — Product Spec

## 개요
마우스·키보드·토너 등 소모품의 재고를 추적하고, 월별 출고 내역과 입고 이력을 관리한다.

## 데이터 소스
- 소모품 마스터 + 재고: `CONSUMABLES_MASTER_SPREADSHEET_ID`
- 출고 내역 (월별 탭): `CONSUMABLES_OUTBOUND_SPREADSHEET_ID`
- 토너 재고: `TONER_SPREADSHEET_ID`

## 탭 구성 (Consumables.jsx)
| 탭 | 역할 |
|----|------|
| 견적서 (월별 합산) | 월별 출고 집계 + Excel 견적서 다운로드 |
| 월별 출고 개별 내역 | 월별 출고 건별 조회/수정/삭제 |
| 신규 출고 월 시작 | 새 월 시트 생성 |
| 소모품 마스터 리스트 | 품목 관리 (일반/토너 서브탭) |
| 재고 추적 관리 | 실시간 재고 현황 |
| 위탁 토너 내역 | 위탁 토너 출고 관리 |
| 입출고 현황 | 품목별 입고·출고 통합 현황 리포트 |

## 입고이력 시트 구조
헤더: `날짜 | 품목명 | 수량 | 비고`
시트명: `입고이력` (소모품 마스터 Spreadsheet 내)

## 관련 파일
- `frontend/src/pages/Consumables.jsx`
- `backend/routers/consumables.py`
- `backend/services/consumables_service.py`
