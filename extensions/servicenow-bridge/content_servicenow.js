// content_servicenow.js
// Stryker ServiceNow 탭 내부에서 동작하는 스크립트

console.log("[SNOW Bridge] Stryker ServiceNow 탭 연동 스크립트 활성화됨");

// 메인 월드(main world)에서 g_ck 토큰을 추출하는 함수
function extractGlideToken() {
  return new Promise((resolve) => {
    // 1. DOM 내부의 hidden input 확인
    const ckInput = document.getElementById("sysparm_ck") || document.querySelector('input[name="sysparm_ck"]');
    if (ckInput && ckInput.value) {
      resolve(ckInput.value);
      return;
    }

    // 2. 메인 월드의 window.g_ck 추출을 위해 스크립트 주입
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

    // 1초 타임아웃
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve("");
    }, 1000);
  });
}

// ServiceNow Table API 직접 호출 함수 (세션 쿠키 + X-UserToken 사용)
async function updateHardwareViaSession(payload) {
  const { serial_number, updates } = payload;
  if (!serial_number) {
    throw new Error("시리얼 번호(Serial Number)가 누락되었습니다.");
  }

  const token = await extractGlideToken();
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (token) {
    headers["X-UserToken"] = token;
  }

  // 1단계: 시리얼 번호로 대상 자산 sys_id 조회
  const queryUrl = `/api/now/table/alm_hardware?sysparm_query=serial_number=${encodeURIComponent(serial_number)}&sysparm_fields=sys_id,asset_tag,serial_number,install_status,substatus,assigned_to,location,department,company&sysparm_limit=2`;
  
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
  // sysparm_input_display_value=true 를 사용하여 텍스트 값 전달
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
