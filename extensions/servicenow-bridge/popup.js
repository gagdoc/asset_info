// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const statusBadge = document.getElementById("sessionStatus");
  const detailEl = document.getElementById("sessionDetail");
  const openSnowBtn = document.getElementById("openSnowBtn");

  chrome.runtime.sendMessage({ action: "CHECK_SERVICENOW_SESSION" }, (response) => {
    if (response && response.connected) {
      statusBadge.className = "badge badge-success";
      statusBadge.textContent = "연결됨 (로그인 감지)";
      detailEl.textContent = "Stryker ServiceNow 탭과 안전하게 연결되어 있습니다.";
      openSnowBtn.textContent = "ServiceNow 탭으로 이동";
    } else {
      statusBadge.className = "badge badge-danger";
      statusBadge.textContent = "미연결";
      detailEl.textContent = "ServiceNow 탭이 열려있지 않거나 로그인되지 않았습니다.";
      openSnowBtn.textContent = "ServiceNow 탭 열기 (로그인)";
    }
  });

  openSnowBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://strykercorp.service-now.com/now/nav/ui/classic/params/target/alm_hardware_list.do" });
  });
});
