// content_asset_info.js
// ASSET_INFO 웹앱 페이지와 통신하는 브릿지 스크립트

console.log("[SNOW Bridge] ASSET_INFO 연동 스크립트 로드됨");

// 웹앱에 확장이 설치되어 있음을 알리는 플래그 주입
function notifyInstalled() {
  window.postMessage({ type: "SNOW_BRIDGE_AVAILABLE", version: "1.0.0" }, "*");
}

notifyInstalled();
setInterval(notifyInstalled, 2000);

// 웹앱으로부터 동기화 요청 수신
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === "SNOW_SYNC_REQUEST") {
    console.log("[SNOW Bridge] 자산 동기화 요청 수신:", event.data.payload);

    // 백그라운드 서비스 워커로 전달
    chrome.runtime.sendMessage(
      { action: "SYNC_ASSET_TO_SERVICENOW", payload: event.data.payload },
      (response) => {
        const lastErr = chrome.runtime.lastError;
        const res = lastErr
          ? { success: false, error: lastErr.message }
          : response;

        console.log("[SNOW Bridge] 처리 결과 응답:", res);
        window.postMessage({ type: "SNOW_SYNC_RESPONSE", result: res }, "*");
      }
    );
  }

  if (event.data.type === "SNOW_NAVIGATE_REQUEST") {
    chrome.runtime.sendMessage({
      action: "NAVIGATE_SERVICENOW_TAB",
      url: event.data.payload.url
    }, (response) => {
      window.postMessage({ type: "SNOW_NAVIGATE_RESPONSE", result: response }, "*");
    });
  }

  if (event.data.type === "SNOW_CHECK_STATUS") {
    chrome.runtime.sendMessage({ action: "CHECK_SERVICENOW_SESSION" }, (response) => {
      window.postMessage({ type: "SNOW_STATUS_RESPONSE", result: response }, "*");
    });
  }
});
