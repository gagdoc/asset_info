// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const statusBadge = document.getElementById("sessionStatus");
  const detailEl = document.getElementById("sessionDetail");
  const openSnowBtn = document.getElementById("openSnowBtn");

  let responded = false;
  const timeoutId = setTimeout(() => {
    if (!responded) {
      statusBadge.className = "badge badge-danger";
      statusBadge.textContent = "응답 대기 초과";
      detailEl.textContent = "ServiceNow 탭을 새로고침(F5)한 뒤 다시 확인해주세요.";
    }
  }, 4000);

  chrome.runtime.sendMessage({ action: "CHECK_SERVICENOW_SESSION" }, (response) => {
    responded = true;
    clearTimeout(timeoutId);

    const lastErr = chrome.runtime.lastError;
    if (lastErr || !response || !response.connected) {
      statusBadge.className = "badge badge-danger";
      statusBadge.textContent = "미연결";
      detailEl.textContent = response?.message || "ServiceNow 탭이 열려있지 않거나 새로고침이 필요합니다.";
      openSnowBtn.textContent = "ServiceNow 탭 열기 (새로고침)";
    } else {
      statusBadge.className = "badge badge-success";
      statusBadge.textContent = "🟢 연결됨 (세션 정상)";
      detailEl.textContent = "Stryker ServiceNow 탭과 성공적으로 연결되었습니다!";
      openSnowBtn.textContent = "ServiceNow 탭으로 이동";
    }
  });

  openSnowBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ url: "*://strykercorp.service-now.com/*" });
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
    } else {
      chrome.tabs.create({ url: "https://strykercorp.service-now.com/now/nav/ui/classic/params/target/alm_hardware_list.do" });
    }
  });
});
