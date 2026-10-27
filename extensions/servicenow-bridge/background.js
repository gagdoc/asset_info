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

// 탭에 스크립트가 로드되지 않았을 경우 자동 주입 후 메시지 재전송하는 헬퍼
async function sendToSnowTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, async (response) => {
      const err = chrome.runtime.lastError;
      if (err && err.message && err.message.includes("Could not establish connection")) {
        console.log("[SNOW Bridge Background] 스크립트 동적 주입 시도...");
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ["content_servicenow.js"]
          });

          // 주입 후 잠시 대기 후 재시도
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              const retryErr = chrome.runtime.lastError;
              if (retryErr) {
                resolve({
                  success: false,
                  error: `ServiceNow 탭 통신 실패: ${retryErr.message}. ServiceNow 브라우저 탭을 한 번 새로고침(F5)해주세요.`
                });
              } else {
                resolve(retryRes);
              }
            });
          }, 350);
        } catch (injectErr) {
          resolve({
            success: false,
            error: `스크립트 주입 실패: ${injectErr.message}. ServiceNow 탭을 새로고침해주세요.`
          });
        }
      } else if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve(response);
      }
    });
  });
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

        const res = await sendToSnowTab(snowTab.id, {
          action: "EXECUTE_SNOW_UPDATE",
          payload: request.payload
        });
        sendResponse(res);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // 비동기 응답 대기
  }

  if (request.action === "NAVIGATE_SERVICENOW_TAB") {
    (async () => {
      try {
        const snowTab = await findServiceNowTab();
        if (snowTab) {
          await chrome.tabs.update(snowTab.id, { url: request.url, active: true });
          if (snowTab.windowId) {
            await chrome.windows.update(snowTab.windowId, { focused: true });
          }
          sendResponse({ success: true, tabId: snowTab.id });
        } else {
          const newTab = await chrome.tabs.create({ url: request.url, active: true });
          sendResponse({ success: true, tabId: newTab.id });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "CHECK_SERVICENOW_SESSION") {
    (async () => {
      try {
        const snowTab = await findServiceNowTab();
        if (!snowTab) {
          sendResponse({ connected: false, message: "ServiceNow 탭 미열림" });
          return;
        }

        const res = await sendToSnowTab(snowTab.id, { action: "PING_SERVICENOW_TAB" });
        if (res && res.success) {
          sendResponse({ connected: true, details: res });
        } else {
          sendResponse({ connected: false, message: res?.error || "응답 없음" });
        }
      } catch (e) {
        sendResponse({ connected: false, error: e.message });
      }
    })();
    return true; // 비동기 응답 대기
  }
});
