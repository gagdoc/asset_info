# ServiceNow Bridge (사내 전용 Chrome Extension)

ASSET_INFO 웹앱에서 수정한 노트북 정보를 **브라우저에 이미 로그인된 Stryker ServiceNow 세션을 활용하여 원클릭으로 자동 업데이트**하는 경량 확장 프로그램입니다.

---

## 3초 설치 방법 (Chrome 브라우저)

1. Chrome 브라우저 주소창에 `chrome://extensions` 입력 후 엔터
2. 우측 상단의 **[개발자 모드(Developer mode)]** 스위치 켜기
3. 좌측 상단의 **[압축해제된 확장 프로그램을 로드합니다(Load unpacked)]** 클릭
4. 이 폴더 선택:
   `/Users/gagdox/Documents/PYTHON/VIBECODING/ASSET_INFO/extensions/servicenow-bridge`
5. 설치 끝! 상단 툴바에 `Asset Info ➔ ServiceNow Bridge` 아이콘이 생성됩니다.

---

## 동작 방식
1. Chrome 브라우저에 **Stryker ServiceNow(`strykercorp.service-now.com`)**에 로그인된 탭을 하나 열어둡니다.
2. **ASSET_INFO 웹앱** 노트북 상세 수정 모달에서 정보를 수정하고 `[ServiceNow 동기화 및 저장]`을 누릅니다.
3. 확장이 사용자의 로그인 세션을 통해 ServiceNow의 해당 시리얼 번호 자산의 `State`, `Substate`, `Location`, `Department`, `Company`, `Assigned to`를 실시간 업데이트합니다.
