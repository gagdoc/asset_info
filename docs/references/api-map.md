# API 전체 맵

## 자산 API — `/api/assets`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/dashboard` | 대시보드 요약 카드 |
| GET | `/dashboard/integrated` | 전체 임직원 통합뷰 (캐시 60초) |
| POST | `/bulk-search` | 이메일/이름 대량 검색 |
| GET | `/{asset_type}` | 자산 목록 (lease/ipad/monitor/printer/teams) |
| GET | `/{asset_type}/download` | 자산 Excel 다운로드 |
| PUT | `/row/update` | 행 수정 |
| DELETE | `/row/delete` | 행 삭제 |
| POST | `/row/add` | 행 추가 |
| POST | `/{asset_type}/replace` | 시트 전체 교체 |
| POST | `/{asset_type}/save` | 시트 저장 |
| GET | `/user/lookup/{email}` | 이메일로 사용자 조회 |
| POST | `/newhire/register` | 신규 입사자 등록 |
| POST | `/newhire/sync` | All_User 동기화 |
| GET | `/unassigned/list` | 미배정 자산 목록 |
| POST | `/resign/register` | 퇴사자 등록 |
| POST | `/resign/return` | 자산 반납 처리 |
| POST | `/resign/delete-master` | All_User에서 삭제 |
| GET | `/config/dept` | 부서 목록 |
| POST | `/config/dept/add` | 부서 추가 |
| POST | `/config/dept/delete` | 부서 삭제 |
| GET | `/{asset_type}/integrity` | 데이터 무결성 검사 |
| GET | `/export` | 선택 항목 Excel 내보내기 (구현 예정) |

---

## 소모품 API — `/api/consumables`

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/clear-cache` | 캐시 초기화 |
| GET | `/months` | 월별 시트 목록 |
| POST | `/months` | 새 월 시트 생성 |
| GET | `/items` | 소모품 품목 목록 |
| POST | `/items` | 품목 추가 |
| DELETE | `/items` | 품목 삭제 |
| GET | `/items/{item_name}/outbound` | 품목별 출고 내역 |
| GET | `/outbound` | 출고 내역 조회 |
| POST | `/outbound` | 출고 추가 |
| PUT | `/outbound` | 출고 수정 |
| DELETE | `/outbound` | 출고 삭제 |
| GET | `/estimate` | 견적서 데이터 |
| GET | `/estimate/download` | 견적서 Excel 다운로드 |
| GET | `/tonner-consignment` | 위탁 토너 내역 |
| GET | `/toner-inventory` | 토너 재고 목록 |
| PUT | `/toner-inventory` | 토너 재고 수정 |
| GET | `/inbound` | 입고 이력 조회 |
| POST | `/inbound` | 입고 기록 추가 |
| PUT | `/inbound` | 입고 기록 수정 |
| DELETE | `/inbound` | 입고 기록 삭제 |
| GET | `/inventory-report` | 품목별 입출고 현황 리포트 |
