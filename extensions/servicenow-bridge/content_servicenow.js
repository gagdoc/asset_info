// content_servicenow.js
// Stryker ServiceNow 탭 내부에서 동작하는 100% 안전한 브라우저 UI 오토필 스크립트
// 외부 REST API 호출 없이 일반 사용자의 화면 조작과 동일한 DOM 이벤트로 작동합니다.

console.log("[SNOW Bridge] Stryker ServiceNow UI 연동 스크립트 활성화됨");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// 🌟 상단 안내 배너 (Notification Banner)
// ─────────────────────────────────────────────────────────────
function showAutoFillBanner(msg, isError = false) {
  const existing = document.getElementById("__snow_bridge_banner__");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "__snow_bridge_banner__";
  banner.style.cssText = `
    position: fixed;
    top: 15px;
    left: 50%;
    transform: translateX(-50%);
    background: ${isError ? "#991b1b" : "#065f46"};
    color: #ffffff;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font-size: 14px;
    font-weight: 600;
    z-index: 99999999;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid ${isError ? "#f87171" : "#34d399"};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  banner.innerHTML = `
    <span>${msg}</span>
    <button style="background:transparent; border:none; color:#ffffff; font-size:16px; cursor:pointer; font-weight:bold; margin-left:8px;">✖</button>
  `;
  banner.querySelector("button").onclick = () => banner.remove();
  document.body.appendChild(banner);

  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, 12000);
}

// ─────────────────────────────────────────────────────────────
// 🌟 일반 인풋 이벤트 트리거
// ─────────────────────────────────────────────────────────────
function triggerInputEvents(input, value) {
  if (!input) return;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("focus", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────
// 🌟 드롭다운 선택 헬퍼
// ─────────────────────────────────────────────────────────────
function selectDropdownByText(select, targetText) {
  if (!select || !targetText) return false;
  const lower = targetText.toLowerCase().trim();
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (opt.text.toLowerCase().trim() === lower || opt.value.toLowerCase().trim() === lower) {
      if (select.selectedIndex !== i) {
        select.selectedIndex = i;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// 🌟 ServiceNow 참조 필드(Reference Field) 자동완성 검색 및 선택
// ─────────────────────────────────────────────────────────────
async function fillReferenceFieldWithAutoComplete(input, queryText, fieldName) {
  if (!input || !queryText) return false;
  console.log(`[SNOW Bridge] 🔍 [${fieldName}] 자동완성 검색 및 선택 시작:`, queryText);

  input.focus();
  input.value = "";
  input.dispatchEvent(new Event("focus", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // 1. 값 설정
  input.value = queryText;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // 2. 가상 키보드 입력 시뮬레이션 (자동완성 팝업 트리거)
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, which: 40, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keypress", { key: "ArrowDown", keyCode: 40, which: 40, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", keyCode: 40, which: 40, bubbles: true }));

  // 3. 페이지 MAIN 월드에 있는 ServiceNow AutoCompleter 객체 직접 실행 시도
  try {
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        try {
          var inputId = ${JSON.stringify(input.id)};
          var el = document.getElementById(inputId);
          if (el) {
            if (el.ac && typeof el.ac.search === 'function') {
              el.ac.search(${JSON.stringify(queryText)});
              if (typeof el.ac.open === 'function') el.ac.open();
            } else {
              var acKey = 'ac_' + inputId.replace(/[:.]/g, '_');
              if (window[acKey] && typeof window[acKey].search === 'function') {
                window[acKey].search(${JSON.stringify(queryText)});
                if (typeof window[acKey].open === 'function') window[acKey].open();
              }
            }
          }
        } catch(e) {}
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {}

  // 4. 자동완성 드롭다운 목록이 화면에 나타날 때까지 감시 (최대 4초 대기)
  const targetLower = queryText.toLowerCase().trim();
  const startTime = Date.now();
  const maxWaitMs = 4000;

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // 시간 초과 체크
      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(checkInterval);
        console.log(`[SNOW Bridge] ⚠️ [${fieldName}] 자동완성 드롭다운 대기 초과 - 텍스트 입력 및 blur 폴백 완료`);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        resolve(false);
        return;
      }

      // ServiceNow Classic UI의 자동완성 드롭다운 컨테이너 셀렉터
      const acContainers = document.querySelectorAll(
        `div[id*="${fieldName}"], div.ac_dropdown, div.ac_results, table.ac_results, div[id^="AC."], .ui-autocomplete`
      );

      for (const container of acContainers) {
        // 화면에 표시되어 있는지 확인
        const style = window.getComputedStyle(container);
        if (style.display === "none" || style.visibility === "hidden" || container.offsetHeight === 0) {
          continue;
        }

        // 행/항목 검색
        const items = container.querySelectorAll("tr, div.ac_row, div.ac_cell, li, tr.ac_row");
        if (items && items.length > 0) {
          console.log(`[SNOW Bridge] 🎯 [${fieldName}] 자동완성 검색 결과 발견 (${items.length}개)`);

          let targetItem = null;
          // 이메일 또는 이름이 일치하는 행 탐색
          for (const item of items) {
            const txt = (item.innerText || item.textContent || "").toLowerCase();
            if (txt.includes(targetLower)) {
              targetItem = item;
              break;
            }
          }

          // 정확한 일치 행이 없으면 첫 번째 유효 행 선택
          if (!targetItem) {
            for (const item of items) {
              if (item.tagName === "TR" || item.classList.contains("ac_row") || item.closest("tr")) {
                targetItem = item.tagName === "TR" ? item : (item.closest("tr") || item);
                break;
              }
            }
          }

          if (targetItem) {
            clearInterval(checkInterval);
            console.log(`[SNOW Bridge] ✨ [${fieldName}] 일치 항목 자동 클릭 선택!`, targetItem);

            // 실제 사람처럼 마우스 클릭 시뮬레이션
            targetItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            targetItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            targetItem.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            targetItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            setTimeout(() => {
              input.dispatchEvent(new Event("change", { bubbles: true }));
              input.dispatchEvent(new Event("blur", { bubbles: true }));
              resolve(true);
            }, 300);
            return;
          }
        }
      }
    }, 150);
  });
}

// ─────────────────────────────────────────────────────────────
// 🌟 메인 오토필 실행 엔진
// ─────────────────────────────────────────────────────────────
let isAutoFilling = false;
let autoFillDone = false;

async function checkAndApplyAutoFill() {
  if (isAutoFilling || autoFillDone) return;

  chrome.storage.local.get("pendingAutoFill", async (res) => {
    const autoFill = res?.pendingAutoFill;
    if (!autoFill) return;

    // 만료 시간 체크 (기본 2분)
    if (autoFill.expiresAt && Date.now() > autoFill.expiresAt) {
      chrome.storage.local.remove("pendingAutoFill");
      return;
    }

    // 현재 프레임에 alm_hardware 관련 폼 요소가 존재하는지 확인
    const stateSelect = document.getElementById("alm_hardware.install_status");
    const substateSelect = document.getElementById("alm_hardware.substatus");
    const assignedInput = document.getElementById("sys_display.alm_hardware.assigned_to") ||
                          document.querySelector('input[name="sys_display.alm_hardware.assigned_to"]');
    const locationInput = document.getElementById("sys_display.alm_hardware.location") ||
                          document.querySelector('input[name="sys_display.alm_hardware.location"]');
    const stockroomInput = document.getElementById("sys_display.alm_hardware.stockroom") ||
                           document.querySelector('input[name="sys_display.alm_hardware.stockroom"]');
    const departmentInput = document.getElementById("sys_display.alm_hardware.department") ||
                            document.querySelector('input[name="sys_display.alm_hardware.department"]');
    const companyInput = document.getElementById("sys_display.alm_hardware.company") ||
                         document.querySelector('input[name="sys_display.alm_hardware.company"]');

    if (!stateSelect && !assignedInput && !locationInput) {
      // 이 프레임에 폼이 없으므로 무시
      return;
    }

    // 시리얼 번호가 페이지에 노출되어 있는 경우 확인
    const serialEl = document.getElementById("alm_hardware.serial_number") ||
                     document.querySelector('input[name="alm_hardware.serial_number"]');
    if (serialEl && autoFill.serial_number) {
      const curSerial = (serialEl.value || "").trim().toLowerCase();
      const targetSerial = (autoFill.serial_number || "").trim().toLowerCase();
      if (curSerial && targetSerial && !curSerial.includes(targetSerial) && !targetSerial.includes(curSerial)) {
        console.log("[SNOW Bridge] 시리얼 번호 불일치로 오토필 대기 중:", curSerial, targetSerial);
        return;
      }
    }

    isAutoFilling = true;
    console.log("[SNOW Bridge] 🎯 ServiceNow 자산 폼 감지! 안전한 UI 자동 입력 시작:", autoFill);

    try {
      let filledCount = 0;

      // 1. State 선택
      if (stateSelect && autoFill.state) {
        const ok = selectDropdownByText(stateSelect, autoFill.state);
        if (ok) filledCount++;
        // ServiceNow가 State 변경에 따라 Assigned to / Stockroom 필드를 동적 토글하므로 450ms 대기
        await sleep(450);
      }

      // 2. Substate 선택
      if (substateSelect && autoFill.substate && autoFill.substate !== "-- None --") {
        const ok = selectDropdownByText(substateSelect, autoFill.substate);
        if (ok) filledCount++;
      }

      // 3. Location 입력
      if (locationInput && autoFill.location) {
        triggerInputEvents(locationInput, autoFill.location);
        filledCount++;
      }

      // 4. Department & Company 입력
      if (departmentInput && autoFill.department) {
        triggerInputEvents(departmentInput, autoFill.department);
      }
      if (companyInput && autoFill.company) {
        triggerInputEvents(companyInput, autoFill.company);
      }

      // 5. State에 따른 분기: In stock vs In use
      const isStockState = (autoFill.state || "").toLowerCase() === "in stock";

      if (isStockState) {
        // Stockroom 채우기
        const curStockroom = document.getElementById("sys_display.alm_hardware.stockroom") || stockroomInput;
        if (curStockroom && autoFill.stockroom) {
          await fillReferenceFieldWithAutoComplete(curStockroom, autoFill.stockroom, "stockroom");
          filledCount++;
        }
      } else {
        // Assigned to: 사용자 이메일 자동 입력 및 검색 결과 자동 선택!
        const curAssigned = document.getElementById("sys_display.alm_hardware.assigned_to") || assignedInput;
        const userQuery = autoFill.email || autoFill.user;
        if (curAssigned && userQuery) {
          console.log("[SNOW Bridge] 👤 Assigned to 자동완성 및 검색 선택 진행:", userQuery);
          await fillReferenceFieldWithAutoComplete(curAssigned, userQuery, "assigned_to");
          filledCount++;
        }
      }

      if (filledCount > 0) {
        autoFillDone = true;
        chrome.storage.local.remove("pendingAutoFill");
        const userDisplay = autoFill.email || autoFill.user || (isStockState ? autoFill.stockroom : autoFill.state);
        showAutoFillBanner(`✨ ASSET_INFO 데이터 자동 입력 완료! (${userDisplay}) 확인 후 상단 [Save / Update]를 눌러주세요.`);
      }
    } catch (err) {
      console.error("[SNOW Bridge] 오토필 실행 중 에러:", err);
    } finally {
      isAutoFilling = false;
    }
  });
}

// 동적 로딩 대응을 위해 주기적으로 감지 (최대 20초간 500ms 간격)
const autoFillPoller = setInterval(() => {
  if (autoFillDone) {
    clearInterval(autoFillPoller);
    return;
  }
  checkAndApplyAutoFill();
}, 500);

setTimeout(() => {
  clearInterval(autoFillPoller);
}, 20000);

// 초기 즉시 실행
checkAndApplyAutoFill();

// ─────────────────────────────────────────────────────────────
// 🌟 메시지 수신 리스너 (세션 확인 및 UI 모드 응답)
// ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING_SERVICENOW_TAB") {
    sendResponse({
      success: true,
      authenticated: true,
      url: window.location.href,
      mode: "safe_dom_autofill"
    });
    return true;
  }
});
