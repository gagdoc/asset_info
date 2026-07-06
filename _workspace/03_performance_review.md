# 성능 리뷰

## 리뷰 개요
- **성능 수준 평가**: 🟡 개선 필요 (중복 인증 및 API 호출로 인한 대기시간 누적)
- **총 발견 수**: Critical 0 / High 1 / Medium 1 / Low 1

## 성능 발견 사항

### 🔴 High
1. **[backend/services/consumables_service.py:128-146]** — 요청마다 구글 서비스 계정 인증 반복 수행 (네트워크 오버헤드)
   - **이유**: `consumables_service.py`에서는 소모품 시트를 다룰 때마다 `_get_consumables_client()`를 호출하여 `gspread.authorize(creds)`를 매번 새로 수행합니다. 구글 OAuth 서버에 매번 토큰 교환 요청을 보내게 되므로 API 트랜잭션당 최소 1~2초의 네트워크 대기 시간이 추가되고 구글 서버의 요청 속도 제한(Rate Limit)을 빠르게 초과하게 됩니다.
   - **현재 코드**:
     ```python
     def _get_consumables_client(spreadsheet_id):
         ...
         # 매번 Credentials 로드 및 인증 발생
         creds = Credentials.from_service_account_file(...)
         client = gspread.authorize(creds)
         return client, client.open_by_key(spreadsheet_id)
     ```
   - **개선 코드**:
     인증 객체(Client) 또는 연결된 스프레드시트(Spreadsheet) 객체를 전역(글로벌) 변수에 캐싱해 두고 재사용해야 합니다.
     ```python
     _cached_client = None
     _cached_spreadsheets = {}

     def _get_consumables_client(spreadsheet_id):
         global _cached_client
         if not _cached_client:
             creds = Credentials.from_service_account_file(...)
             _cached_client = gspread.authorize(creds)
         
         if spreadsheet_id not in _cached_spreadsheets:
             _cached_spreadsheets[spreadsheet_id] = _cached_client.open_by_key(spreadsheet_id)
             
         return _cached_client, _cached_spreadsheets[spreadsheet_id]
     ```

### 🟡 Medium
1. **[backend/services/sheets_service.py:57]** — 요청마다 일회성 ThreadPoolExecutor 생성
   - **이유**: Google Sheets API 호출의 타임아웃 처리를 위해 `_run_with_timeout` 함수 내부에서 매번 `concurrent.futures.ThreadPoolExecutor(max_workers=1)`를 `with` 컨텍스트로 생성 및 폐기하고 있습니다. 비록 싱글 워커이지만 잦은 API 호출 시 스레드 풀 생성/소멸 오버헤드가 누적됩니다.
   - **개선 제안**: 전역에 싱글톤 스레드 풀을 선언하여 재사용하거나, gspread 클라이언트에 내장된 HTTP 세션 타임아웃 파라미터를 조절하여 스레드 분리 없이 동작하게 구조를 단순화하십시오.

### 🟢 Low / Informational
1. **칭찬 사항: Batch Get 최적화 (`sheets_service.py:191`)**
   - **이유**: `_load_sheets_internal` 함수 내에서 9개의 개별 시트 탭 데이터를 가져올 때, 9번 루프를 돌며 API를 호출하는 대신 `spreadsheet.values_batch_get(ranges)`를 사용해 단 한 번의 HTTP 요청으로 묶어서 가져오고 있습니다. 이는 구글 API의 네트워크 라운드트립 타임(RTT)을 극적으로 절약한 아주 좋은 최적화 사례입니다.
