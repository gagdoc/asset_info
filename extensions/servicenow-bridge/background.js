// background.js (Service Worker)

console.log("[SNOW Bridge Background] 서비스 워커 시작됨");

// 열려 있는 Stryker ServiceNow 탭 찾기
async function findServiceNowTab() {
  const tabs = await chrome.tabs.query({ url: "*://strykercorp.service-now.com/*" });
  if (tabs && tabs.length > 0) {
    return tabs[0];
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_ASSET_TO_SERVICENOW") {
    (async () => {
      try {
        const snowTab = await findServiceNowTab();
        if (!snowTab) {
          sendResponse({
            success: false,
            error: "ServiceNow 탭이 열려있지 않습니다. 브라우저 새 탭에서 Stryker ServiceNow(strykercorp.service-now.com)에 로그인 후 다시 시도해주세요."
          });
          return;
        }

        // 해당 탭으로 업데이트 명령 전달
        chrome.tabs.sendMessage(
          snowTab.id,
          { action: "EXECUTE_SNOW_UPDATE", payload: request.payload },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              sendResponse({
                success: false,
                error: `ServiceNow 탭과의 통신 오류: ${err.message}. 해당 탭을 새로고침해주세요.`
              });
            } else {
              sendResponse(response);
            }
          }
        );
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // 비동기 응답 대기
  }

  if (request.action === "CHECK_SERVICENOW_SESSION") {
    (async () => {
      try {
        const snowTab = await findServiceNowTab();
        if (!snowTab) {
          sendResponse({ connected: false, message: "ServiceNow 탭 미열림" });
          return;
        }

        chrome.tabs.sendMessage(
          snowTab.id,
          { action: "PING_SERVICENOW_TAB" },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              sendResponse({ connected: false, message: "응답 없음" });
            } else {
              sendResponse({ connected: true, details: response });
            }
          }
        );
      } catch (e) {
        sendResponse({ connected: false, error: e.message });
      }
    })();
    return true;
  }
});
