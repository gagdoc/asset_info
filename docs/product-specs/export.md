# 전체 데이터 Excel 내보내기 — Product Spec

## 상태
🟡 구현 예정 (Active)

## 개요
대시보드 상단에서 원하는 메뉴 항목을 선택해 하나의 Excel 파일로 다운로드한다.
각 항목은 별도 시트(탭)로 구성된다.

## 사용자 스토리
> "대시보드에서 원하는 자산/인사 데이터를 체크박스로 선택하고,
> 버튼 하나로 항목별로 시트가 나뉜 Excel 파일을 받고 싶다."

## UI 명세 (Dashboard.jsx 상단 추가)

### 컴포넌트 구성
```
[ ] 노트북 (Lease)    [ ] 아이패드 (iPad)   [ ] 모니터 (Monitor)
[ ] 프린터 (Printer)  [ ] Teams 번호        [ ] 신규 입사자
[ ] 퇴사자 관리

[전체 선택]   [📥 선택 항목 Excel 내보내기]
```

### 동작 방식
1. 체크박스로 항목 선택 (최소 1개 필수)
2. "전체 선택" 버튼 → 전체 체크/해제 토글
3. "Excel 내보내기" 클릭 → 백엔드 API 호출
4. 응답으로 `.xlsx` 파일 스트리밍 다운로드

## API 명세

### `GET /api/assets/export`

**Query Parameters**
| 파라미터 | 타입 | 예시 | 설명 |
|---------|------|------|------|
| `sheets` | string (comma) | `Lease,iPad,Monitor` | 내보낼 시트 목록 |

**Response**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="asset_export_YYYYMMDD.xlsx"`

**시트 구성**
| 선택 항목 | 시트명 | 데이터 소스 |
|----------|--------|------------|
| 노트북 | 노트북 | Lease_List |
| 아이패드 | 아이패드 | Ipad_List |
| 모니터 | 모니터 | Monitor |
| 프린터 | 프린터 | Printer |
| Teams 번호 | Teams번호 | TeamsNumber |
| 신규 입사자 | 신규입사자 | 신규입사자 |
| 퇴사자 관리 | 퇴사자 | 퇴사자 |

## 구현 파일
- `backend/routers/assets.py` — 엔드포인트 추가
- `backend/services/assets_service.py` — `export_sheets_to_excel()` 함수
- `frontend/src/pages/Dashboard.jsx` — UI 추가
- `openpyxl` 사용 (이미 requirements.txt에 포함됨)
