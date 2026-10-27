// content_servicenow.js
// Stryker ServiceNow 탭 내부에서 동작하는 스크립트

console.log("[SNOW Bridge] Stryker ServiceNow 탭 연동 스크립트 활성화됨");

// 메인 월드(main world)에서 g_ck 토큰을 추출하는 함수
function extractGlideToken() {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        var token = '';
        if (typeof g_ck !== 'undefined' && g_ck) token = g_ck;
        else if (window.g_ck) token = window.g_ck;
        else if (window.NOW && window.NOW.g_ck) token = window.NOW.g_ck;
        else {
          var input = document.getElementById("sysparm_ck") || document.querySelector('input[name="sysparm_ck"]');
          if (input) token = input.value;
        }
        window.postMessage({
          type: "__SNOW_TOKEN_EXTRACTED__",
          token: token
        }, '*');
      })();
    `;
    const handler = (e) => {
      if (e.data && e.data.type === "__SNOW_TOKEN_EXTRACTED__") {
        window.removeEventListener("message", handler);
        resolve(e.data.token || "");
      }
    };
    window.addEventListener("message", handler);
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve("");
    }, 1000);
  });
}

// ─────────────────────────────────────────────────────────────
// 🌟 폼 필드 자동 채우기 (Auto-fill Form) 기능
// ─────────────────────────────────────────────────────────────
function showAutoFillBanner(msg) {
  if (document.getElementById("__snow_bridge_banner__")) return;
  const banner = document.createElement("div");
  banner.id = "__snow_bridge_banner__";
  banner.style.cssText = `
    position: fixed;
    top: 15px;
    left: 50%;
    transform: translateX(-50%);
    background: #065f46;
    color: #ecfdf5;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3);
    font-size: 14px;
    font-weight: 600;
    z-index: 9999999;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid #34d399;
    animation: fadeInDown 0.3s ease;
  `;
  banner.innerHTML = `
    <span>${msg}</span>
    <button style="background:transparent; border:none; color:#ecfdf5; font-size:16px; cursor:pointer; font-weight:bold;">✖</button>
  `;
  banner.querySelector("button").onclick = () => banner.remove();
  document.body.appendChild(banner);

  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, 10000);
}

function triggerInputEvents(input, value) {
  if (!input) return;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true }));
}

function selectDropdownByText(select, targetText) {
  if (!select || !targetText) return;
  const lower = targetText.toLowerCase().trim();
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (opt.text.toLowerCase().trim() === lower || opt.value.toLowerCase().trim() === lower) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      break;
    }
  }
}

async function checkAndApplyAutoFill() {
  chrome.storage.local.get("pendingAutoFill", (res) => {
    const autoFill = res?.pendingAutoFill;
    if (!autoFill) return;

    // 현재 페이지/프레임에서 alm_hardware 관련 필드가 있는지 확인
    const assignedInput = document.getElementById("sys_display.alm_hardware.assigned_to") ||
                          document.querySelector('input[name="sys_display.alm_hardware.assigned_to"]');
    const stateSelect = document.getElementById("alm_hardware.install_status");
    const substateSelect = document.getElementById("alm_hardware.substatus");
    const locationInput = document.getElementById("sys_display.alm_hardware.location");
    const stockroomInput = document.getElementById("sys_display.alm_hardware.stockroom");
    const departmentInput = document.getElementById("sys_display.alm_hardware.department");
    const companyInput = document.getElementById("sys_display.alm_hardware.company");

    if (!assignedInput && !stateSelect && !locationInput) {
      // 이 프레임이 아닐 수 있으므로 패스
      return;
    }

    console.log("[SNOW Bridge] 🎯 자산 폼 발견! ASSET_INFO 데이터 자동 입력 시작:", autoFill);

    let filledCount = 0;

    // 1. State
    if (stateSelect && autoFill.state) {
      selectDropdownByText(stateSelect, autoFill.state);
      filledCount++;
    }

    // 2. Substate
    if (substateSelect && autoFill.substate && autoFill.substate !== "-- None --") {
      selectDropdownByText(substateSelect, autoFill.substate);
      filledCount++;
    }

    // 3. Assigned to (사용자/이메일 자동 채우기)
    if (assignedInput && (autoFill.email || autoFill.user)) {
      const userVal = autoFill.email || autoFill.user;
      triggerInputEvents(assignedInput, userVal);
      filledCount++;
    }

    // 4. Stockroom
    if (stockroomInput && autoFill.stockroom && autoFill.state === "In stock") {
      triggerInputEvents(stockroomInput, autoFill.stockroom);
      filledCount++;
    }

    // 5. Location
    if (locationInput && autoFill.location) {
      triggerInputEvents(locationInput, autoFill.location);
      filledCount++;
    }

    // 6. Department
    if (departmentInput && autoFill.department) {
      triggerInputEvents(departmentInput, autoFill.department);
      filledCount++;
    }

    // 7. Company
    if (companyInput && autoFill.company) {
      triggerInputEvents(companyInput, autoFill.company);
      filledCount++;
    }

    if (filledCount > 0) {
      const userDisplay = autoFill.email || autoFill.user || (autoFill.state === "In stock" ? autoFill.stockroom : "");
      showAutoFillBanner(`✨ ASSET_INFO 데이터 자동 입력 완료! (${userDisplay}) 확인 후 상단 [Save / Update]를 눌러주세요.`);
      // 1회 입력 완료 후 스토리지 비우기
      chrome.storage.local.remove("pendingAutoFill");
    }
  });
}

// DOM 로드 완료 후 자동 채우기 감지 실행 (프레임 내 동적 로딩 고려)
setTimeout(checkAndApplyAutoFill, 800);
setTimeout(checkAndApplyAutoFill, 2000);
setTimeout(checkAndApplyAutoFill, 3500);

// ─────────────────────────────────────────────────────────────
// ServiceNow Table API 직접 호출 함수
// ─────────────────────────────────────────────────────────────
async function updateHardwareViaSession(payload) {
  const { serial_number, updates } = payload;
  if (!serial_number) {
    throw new Error("시리얼 번호(Serial Number)가 누락되었습니다.");
  }

  const token = await extractGlideToken();
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-WantSession": "true"
  };
  if (token) {
    headers["X-UserToken"] = token;
  }

  // 1단계: 시리얼 번호로 대상 자산 sys_id 조회
  const queryUrl = `/api/now/table/alm_hardware?sysparm_query=serial_number=${encodeURIComponent(serial_number)}&sysparm_fields=sys_id,asset_tag,serial_number,install_status,substatus,assigned_to,location,department,company,stockroom&sysparm_limit=2`;
  
  const queryRes = await fetch(queryUrl, {
    method: "GET",
    headers,
    credentials: "include"
  });

  if (!queryRes.ok) {
    if (queryRes.status === 401 || queryRes.status === 403) {
      throw new Error(`ServiceNow 세션 만료 또는 권한 오류 (${queryRes.status}). 브라우저에서 ServiceNow에 다시 로그인해주세요.`);
    }
    const errText = await queryRes.text();
    throw new Error(`ServiceNow 자산 조회 실패 (${queryRes.status}): ${errText}`);
  }

  const queryJson = await queryRes.json();
  const records = queryJson.result || [];

  if (records.length === 0) {
    throw new Error(`ServiceNow에서 시리얼 번호 '${serial_number}'에 해당하는 자산을 찾을 수 없습니다.`);
  }
  if (records.length > 1) {
    throw new Error(`ServiceNow에 동일한 시리얼 번호 '${serial_number}'가 여러 건(${records.length}건) 존재합니다. 수동 확인이 필요합니다.`);
  }

  const targetAsset = records[0];
  const sysId = targetAsset.sys_id;

  // 2단계: 필드 업데이트 데이터 구성
  const patchBody = {};
  if (updates.install_status !== undefined && updates.install_status !== "") {
    patchBody.install_status = updates.install_status;
  }
  if (updates.substatus !== undefined && updates.substatus !== "") {
    patchBody.substatus = updates.substatus;
  }
  if (updates.assigned_to !== undefined && updates.assigned_to !== "") {
    patchBody.assigned_to = updates.assigned_to;
  }
  if (updates.stockroom !== undefined && updates.stockroom !== "") {
    patchBody.stockroom = updates.stockroom;
  }
  if (updates.location !== undefined && updates.location !== "") {
    patchBody.location = updates.location;
  }
  if (updates.department !== undefined && updates.department !== "") {
    patchBody.department = updates.department;
  }
  if (updates.company !== undefined && updates.company !== "") {
    patchBody.company = updates.company;
  }

  const patchUrl = `/api/now/table/alm_hardware/${sysId}?sysparm_input_display_value=true`;
  const patchRes = await fetch(patchUrl, {
    method: "PATCH",
    headers,
    credentials: "include",
    body: JSON.stringify(patchBody)
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`ServiceNow 업데이트 실패 (${patchRes.status}): ${errText}`);
  }

  const patchJson = await patchRes.json();
  return {
    success: true,
    message: `ServiceNow 자산(${serial_number})이 성공적으로 업데이트되었습니다.`,
    sys_id: sysId,
    asset_tag: targetAsset.asset_tag,
    updated_fields: patchBody,
    result: patchJson.result
  };
}

// 백그라운드로부터의 메시지 수신 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "EXECUTE_SNOW_UPDATE") {
    updateHardwareViaSession(request.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 비동기 응답 대기
  }

  if (request.action === "PING_SERVICENOW_TAB") {
    extractGlideToken().then((token) => {
      sendResponse({
        success: true,
        authenticated: !!token || document.cookie.includes("JSESSIONID"),
        url: window.location.href,
        hasToken: !!token
      });
    });
    return true;
  }
});
