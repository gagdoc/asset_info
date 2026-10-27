// background.js (Service Worker)
// Stryker ServiceNow 탭 검색 및 안전한 UI 자동 입력 연동 관리

console.log("[SNOW Bridge Background] 서비스 워커 시작됨 (Safe UI Mode)");

// 열려 있는 Stryker ServiceNow 탭 찾기
async function findServiceNowTab() {
  const tabs = await chrome.tabs.query({ url: "*://strykercorp.service-now.com/*" });
  if (tabs && tabs.length > 0) {
    return tabs[0];
  }
  return null;
}

// 탭에 스크립트가 로드되지 않았을 경우 자동 주입 후 메시지 전송하는 헬퍼
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

          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              const retryErr = chrome.runtime.lastError;
              if (retryErr) {
                resolve({
                  success: false,
                  error: `ServiceNow 탭 통신 대기 중. ServiceNow 브라우저 탭을 한 번 새로고침(F5)해주세요.`
                });
              } else {
                resolve(retryRes);
              }
            });
          }, 350);
        } catch (injectErr) {
          resolve({
            success: false,
            error: `스크립트 주입 오류: ${injectErr.message}. ServiceNow 탭을 새로고침해주세요.`
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
  // 1. 자산 정보 동기화 요청 (안전한 UI 오토필 모드로 전환: REST API 완전 배제)
  if (request.action === "SYNC_ASSET_TO_SERVICENOW") {
    (async () => {
      try {
        const payload = request.payload;
        const sn = payload?.serial_number;
        if (!sn) {
          sendResponse({ success: false, error: "시리얼 번호(Serial Number)가 누락되었습니다." });
          return;
        }

        const targetUrl = `https://strykercorp.service-now.com/now/nav/ui/classic/params/target/alm_hardware.do%3Fsysparm_query%3Dserial_number%3D${encodeURIComponent(sn)}`;
        const autoFill = {
          serial_number: sn,
          state: payload.updates?.install_status || "In use",
          substate: payload.updates?.substatus || "",
          email: payload.updates?.assigned_to || "",
          user: payload.updates?.assigned_to || "",
          stockroom: payload.updates?.stockroom || "Korea Stock Room",
          location: payload.updates?.location || "",
          department: payload.updates?.department || "",
          company: payload.updates?.company || "Asia Pacific",
          expiresAt: Date.now() + 120000
        };

        // 오토필 데이터 로컬 스토리지에 예약 저장
        await chrome.storage.local.set({ pendingAutoFill: autoFill });
        console.log("[SNOW Bridge Background] UI 오토필 예약 완료:", autoFill);

        // ServiceNow 탭으로 이동 및 포커스
        const snowTab = await findServiceNowTab();
        if (snowTab) {
          await chrome.tabs.update(snowTab.id, { url: targetUrl, active: true });
          if (snowTab.windowId) {
            await chrome.windows.update(snowTab.windowId, { focused: true });
          }
          sendResponse({
            success: true,
            mode: "ui_autofill",
            message: `ServiceNow '${sn}' 자산 페이지로 이동하여 최신 정보(상태 및 사용자)를 자동 입력합니다. 확인 후 상단 [Save]를 눌러주세요.`
          });
        } else {
          const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
          sendResponse({
            success: true,
            mode: "ui_autofill",
            message: `새 탭에서 ServiceNow '${sn}' 자산 페이지를 열고 최신 정보(상태 및 사용자)를 자동 입력합니다. 확인 후 상단 [Save]를 눌러주세요.`
          });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // 비동기 응답 대기
  }

  // 2. ServiceNow 페이지 직접 열기 및 오토필 예약
  if (request.action === "NAVIGATE_SERVICENOW_TAB") {
    (async () => {
      try {
        if (request.autoFill) {
          request.autoFill.expiresAt = Date.now() + 120000;
          await chrome.storage.local.set({ pendingAutoFill: request.autoFill });
          console.log("[SNOW Bridge Background] NAVIGATE 오토필 예약 완료:", request.autoFill);
        }
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
    return true; // 비동기 응답 대기
  }

  // 3. ServiceNow 탭 연결 상태 확인
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
          sendResponse({ connected: false, message: res?.error || "ServiceNow 탭 응답 대기 중" });
        }
      } catch (e) {
        sendResponse({ connected: false, error: e.message });
      }
    })();
    return true; // 비동기 응답 대기
  }
});
