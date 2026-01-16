// content.js - Bộ não xử lý của Extension
// Hỗ trợ: Google Forms, React, Angular, Vue và các framework hiện đại

// ============================================
// PHẦN 0: PHÁT HIỆN GOOGLE FORMS
// ============================================
function isGoogleForms() {
  return window.location.hostname.includes('google.com') && 
         window.location.pathname.includes('/forms/');
}

// ============================================
// PHẦN 1: QUÉT TRANG WEB (để tạo Prompt cho AI)
// ============================================
function getPageStructure() {
  let elements;
  
  // Đặc biệt cho Google Forms - quét thêm các element đặc thù
  if (isGoogleForms()) {
    elements = document.querySelectorAll(
      "input, textarea, select, button, " +
      "[role='listbox'], [role='option'], [role='radio'], [role='checkbox'], " +
      "[data-value], [data-answer-value], " +
      "[contenteditable='true'], " +
      ".quantumWizTextinputPaperinputInput, .quantumWizTextinputPapertextareaInput, " +
      ".docssharedWizToggleLabeledContainer, " +
      "[jsname='YPqjbf'], [jsname='ikxPsb']"
    );
  } else {
    elements = document.querySelectorAll(
      "input, button, select, textarea, a, [role='button'], [role='checkbox'], [role='radio'], [contenteditable='true']"
    );
  }
  
  let structure = [];
  let questionMap = new Map(); // Cho Google Forms: map câu hỏi với các lựa chọn

  // Với Google Forms, tìm tất cả các câu hỏi trước
  if (isGoogleForms()) {
    const questions = document.querySelectorAll('[role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot');
    questions.forEach((q, qIndex) => {
      const questionText = q.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseHeader')?.innerText?.trim() || "";
      
      // Tìm input trong câu hỏi này
      const inputs = q.querySelectorAll('input, textarea, [role="radio"], [role="checkbox"], [role="option"], [data-value]');
      inputs.forEach(input => {
        questionMap.set(input, { questionIndex: qIndex, questionText: questionText });
      });
    });
  }

  elements.forEach((el, index) => {
    // Bỏ qua các element ẩn (trừ radio/checkbox ẩn của Google Forms)
    const isHiddenInput = el.type === 'hidden';
    const isGoogleFormsHidden = isGoogleForms() && (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox');
    if (el.offsetParent === null && !isHiddenInput && !isGoogleFormsHidden) return;
    
    // Gán một ID tạm nếu chưa có để AI dễ gọi tên
    if (!el.id) {
      el.dataset.tempId = "ai_" + index;
    }
    
    // Lấy nhãn (Label) để AI hiểu ngữ cảnh
    let label = "";
    
    // Đặc biệt cho Google Forms
    if (isGoogleForms()) {
      // Lấy text của option (cho radio/checkbox)
      const optionLabel = el.closest('[data-value]')?.getAttribute('data-value') ||
                          el.closest('.docssharedWizToggleLabeledContainer')?.innerText?.trim() ||
                          el.getAttribute('data-answer-value') ||
                          el.getAttribute('aria-label');
      
      // Lấy câu hỏi từ map
      const questionInfo = questionMap.get(el);
      if (questionInfo) {
        label = questionInfo.questionText;
        if (optionLabel) {
          label += ` → ${optionLabel}`;
        }
      } else if (optionLabel) {
        label = optionLabel;
      }
    }
    
    // Fallback cho các trang thông thường
    if (!label) {
      if (el.labels && el.labels.length > 0) {
        label = el.labels[0].innerText;
      } else if (el.getAttribute('aria-label')) {
        label = el.getAttribute('aria-label');
      } else if (el.placeholder) {
        label = el.placeholder;
      } else if (el.innerText && el.innerText.length < 100) {
        label = el.innerText;
      } else if (el.title) {
        label = el.title;
      } else if (el.name) {
        label = el.name;
      }
    }

    // Lấy thêm thông tin hữu ích
    const questionInfo = questionMap.get(el);
    
    const elementInfo = {
      id: el.id || null,
      tempId: el.dataset.tempId || null,
      tag: el.tagName.toLowerCase(),
      type: el.type || el.getAttribute('role') || "",
      name: el.name || null,
      label: label.trim().substring(0, 120), // Tăng độ dài cho Google Forms
      required: el.required || el.getAttribute('aria-required') === 'true' || false,
      disabled: el.disabled || false,
      dataValue: el.getAttribute('data-value') || el.getAttribute('data-answer-value') || null, // Cho Google Forms (radio dùng data-value, checkbox dùng data-answer-value)
      qIndex: questionInfo?.questionIndex ?? null // Index câu hỏi (0, 1, 2...)
    };

    // Thêm options cho select
    if (el.tagName === 'SELECT') {
      elementInfo.options = Array.from(el.options).map(opt => ({
        value: opt.value,
        text: opt.text.substring(0, 50)
      }));
    }
    
    // Cho Google Forms dropdown (role="listbox")
    if (el.getAttribute('role') === 'listbox') {
      const options = el.querySelectorAll('[role="option"], [data-value]');
      elementInfo.options = Array.from(options).map(opt => ({
        value: opt.getAttribute('data-value') || opt.innerText,
        text: opt.innerText?.substring(0, 50) || ""
      }));
    }

    // Thêm giá trị hiện tại (nếu có)
    if (el.value && el.type !== 'password') {
      elementInfo.currentValue = el.value.substring(0, 50);
    } else if (el.isContentEditable) {
      elementInfo.currentValue = el.innerText?.substring(0, 50) || "";
      elementInfo.isContentEditable = true;
    }

    structure.push(elementInfo);
  });

  return {
    url: window.location.href,
    title: document.title,
    isGoogleForms: isGoogleForms(),
    elementsCount: structure.length,
    elements: structure
  };
}

// ============================================
// PHẦN 2: TRÌNH THÔNG DỊCH JSON (Interpreter)
// Hỗ trợ Google Forms và contenteditable
// ============================================

// Helper: Điền giá trị vào element (hỗ trợ nhiều loại)
async function fillElement(el, value) {
  const tagName = el.tagName.toUpperCase();
  const isContentEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  
  // Focus trước
  el.focus();
  await new Promise(r => setTimeout(r, 100));
  
  // Xử lý contenteditable (Google Forms text input)
  if (isContentEditable) {
    // Clear nội dung cũ
    el.innerText = '';
    el.textContent = '';
    
    // Điền giá trị mới
    el.innerText = value;
    el.textContent = value;
    
    // Dispatch events cho React/Angular
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // Simulate typing cho Google Forms
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    });
    el.dispatchEvent(inputEvent);
    
    console.log(`✅ Đã điền (contenteditable): "${value}"`);
    return true;
  }
  
  // Xử lý input/textarea thông thường
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    // Clear giá trị cũ
    el.value = '';
    
    // Set giá trị mới
    el.value = value;
    
    // Dispatch nhiều loại events
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    
    // Cho React forms
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    console.log(`✅ Đã điền (input): "${value}"`);
    return true;
  }
  
  // Fallback: thử cả value và innerText
  try {
    if ('value' in el) {
      el.value = value;
    }
    if ('innerText' in el) {
      el.innerText = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Đã điền (fallback): "${value}"`);
    return true;
  } catch (e) {
    console.error("Lỗi khi điền:", e);
    return false;
  }
}

// Helper: Click element cho Google Forms (cần click nhiều lần/chỗ khác nhau)
async function clickGoogleFormsElement(el) {
  // Tìm element cha có thể click được
  let clickTarget = el;
  
  // Với radio/checkbox Google Forms, cần click vào container
  if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') {
    clickTarget = el.closest('.docssharedWizToggleLabeledContainer') || 
                  el.closest('[data-value]') ||
                  el.closest('.appsMaterialWizToggleRadiogroupEl') ||
                  el;
  }
  
  // Click với mouse events đầy đủ
  const rect = clickTarget.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  await new Promise(r => setTimeout(r, 50));
  clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
  await new Promise(r => setTimeout(r, 50));
  clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  
  // Fallback click
  clickTarget.click();
  
  return true;
}

// Helper: Scroll toàn bộ trang để load lazy elements (Google Forms)
async function scrollToLoadAll() {
  const scrollStep = window.innerHeight;
  const maxScrolls = 50; // Giới hạn để tránh infinite scroll
  let currentScroll = 0;
  
  for (let i = 0; i < maxScrolls; i++) {
    window.scrollTo(0, currentScroll);
    await new Promise(r => setTimeout(r, 100));
    currentScroll += scrollStep;
    
    if (currentScroll >= document.body.scrollHeight) {
      break;
    }
  }
  
  // Scroll về đầu trang
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 200));
}

async function executeJSON(plan) {
  if (!Array.isArray(plan)) {
    console.error("❌ Lỗi: Dữ liệu nhập vào không phải là mảng JSON hợp lệ!");
    return { success: false, message: "Dữ liệu không phải mảng JSON" };
  }

  const isGForms = isGoogleForms();
  
  // Cache các câu hỏi Google Forms để tìm nhanh hơn
  let questionContainers = [];
  if (isGForms) {
    console.log("📋 Phát hiện Google Forms - sử dụng chế độ tương thích");
    console.log("📜 Đang scroll để load tất cả elements...");
    await scrollToLoadAll();
    
    // Cache tất cả câu hỏi
    questionContainers = Array.from(document.querySelectorAll('[role="listitem"], .freebirdFormviewerComponentsQuestionBaseRoot'));
    console.log(`✅ Đã load xong, tìm thấy ${questionContainers.length} câu hỏi`);
  }

  let results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    console.log(`🔄 Bước ${i + 1}/${plan.length}:`, step);

    // Xử lý action wait đặc biệt (không cần element)
    if (step.action === "wait") {
      const waitTime = step.value || 1000;
      console.log(`⏳ Đợi ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      results.push({ step: i + 1, success: true, action: "wait" });
      successCount++;
      continue;
    }

    // 1. Tìm phần tử
    let el = null;
    const identifier = step.id || step.tempId;
    const targetValue = step.dataValue || step.value;

    // ƯU TIÊN 1: Tìm theo qIndex + dataValue (CHÍNH XÁC NHẤT cho Google Forms)
    if (!el && isGForms && step.qIndex !== undefined && step.qIndex !== null && targetValue) {
      const questionContainer = questionContainers[step.qIndex];
      if (questionContainer) {
        // Tìm option có data-value hoặc data-answer-value khớp trong câu hỏi này
        // Radio dùng data-value, Checkbox dùng data-answer-value
        const options = questionContainer.querySelectorAll('[data-value], [data-answer-value]');
        for (const opt of options) {
          const optValue = opt.getAttribute('data-value') || opt.getAttribute('data-answer-value');
          if (optValue === targetValue) {
            el = opt;
            console.log(`🎯 Tìm thấy bằng qIndex=${step.qIndex} + dataValue="${targetValue}"`);
            break;
          }
        }
      }
    }

    // ƯU TIÊN 1.5: Tìm input/textarea theo qIndex cho action fill (điền text)
    if (!el && isGForms && step.qIndex !== undefined && step.qIndex !== null && step.action === "fill") {
      const questionContainer = questionContainers[step.qIndex];
      if (questionContainer) {
        // Tìm input, textarea hoặc contenteditable trong câu hỏi này
        el = questionContainer.querySelector('input:not([type="hidden"]), textarea, [contenteditable="true"]');
        if (el) {
          console.log(`🎯 Tìm thấy input/textarea bằng qIndex=${step.qIndex} cho action fill`);
        }
      }
    }

    // ƯU TIÊN 2: Tìm theo selector
    if (!el && step.selector) {
      el = document.querySelector(step.selector);
      if (el) console.log(`🔍 Tìm thấy bằng selector`);
    }
    
    // ƯU TIÊN 3: Tìm theo id gốc của DOM
    if (!el && identifier) {
      el = document.getElementById(identifier);
      if (el) console.log(`🔍 Tìm thấy bằng id: "${identifier}"`);
    }
    
    // ƯU TIÊN 4: Tìm theo data-temp-id
    if (!el && identifier) {
      el = document.querySelector(`[data-temp-id="${identifier}"]`);
      if (el) console.log(`🔍 Tìm thấy bằng data-temp-id: "${identifier}"`);
    }
    
    // ƯU TIÊN 5: Tìm theo name
    if (!el && step.name) {
      el = document.querySelector(`[name="${step.name}"]`);
      if (el) console.log(`🔍 Tìm thấy bằng name: "${step.name}"`);
    }
    
    // ƯU TIÊN 6: Tìm theo data-value hoặc data-answer-value (có thể trùng nếu nhiều câu cùng đáp án)
    if (!el && targetValue && isGForms) {
      el = document.querySelector(`[data-value="${targetValue}"], [data-answer-value="${targetValue}"]`);
      if (el) console.log(`⚠️ Tìm thấy bằng dataValue (có thể không chính xác nếu trùng): "${targetValue}"`);
    }

    // Nếu không tìm thấy element
    if (!el) {
      console.warn(`❌ Không tìm thấy phần tử:`, step);
      results.push({ step: i + 1, success: false, error: "Element not found", step_info: step });
      failCount++;
      continue;
    }

    // 2. Thực thi action (KHÔNG scroll từng element để tăng tốc)
    try {
      switch (step.action) {
        case "fill":
        case "type":
          await fillElement(el, step.value || "");
          break;

        case "click":
          if (isGForms) {
            await clickGoogleFormsElement(el);
          } else {
            el.focus();
            el.click();
          }
          console.log(`✅ Đã click`);
          break;

        case "select":
          // Cho dropdown/select thông thường
          if (el.tagName === 'SELECT') {
            el.value = step.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ Đã chọn: "${step.value}"`);
          } 
          // Cho Google Forms dropdown
          else if (isGForms) {
            // Click để mở dropdown
            el.click();
            await new Promise(r => setTimeout(r, 500));
            
            // Tìm và click option
            const options = document.querySelectorAll('[role="option"], [data-value]');
            for (const opt of options) {
              if (opt.innerText?.includes(step.value) || opt.getAttribute('data-value') === step.value) {
                opt.click();
                console.log(`✅ Đã chọn (Google Forms): "${step.value}"`);
                break;
              }
            }
          }
          break;

        case "check":
          // Cho checkbox/radio thông thường
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = step.value !== false;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('click', { bubbles: true }));
            console.log(`✅ Đã ${el.checked ? 'check' : 'uncheck'}`);
          } 
          // Cho Google Forms radio/checkbox
          else if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') {
            await clickGoogleFormsElement(el);
            console.log(`✅ Đã check (Google Forms)`);
          }
          break;

        case "focus":
          el.focus();
          console.log(`✅ Đã focus`);
          break;

        case "blur":
          el.blur();
          console.log(`✅ Đã blur`);
          break;

        default:
          console.warn(`⚠️ Action không xác định: ${step.action}`);
      }

      results.push({ step: i + 1, success: true, action: step.action });
      successCount++;

    } catch (error) {
      console.error(`❌ Lỗi khi thực thi:`, error);
      results.push({ step: i + 1, success: false, error: error.message });
      failCount++;
    }

    // Đợi ngắn giữa các action (giảm từ 800ms xuống 100ms để tăng tốc)
    const delay = step.delay || 100;
    await new Promise(r => setTimeout(r, delay));
  }

  const summary = {
    success: failCount === 0,
    total: plan.length,
    completed: successCount,
    failed: failCount,
    results: results
  };

  console.log("📊 Kết quả thực thi:", summary);
  return summary;
}

// ============================================
// PHẦN 3: LẮNG NGHE LỆNH TỪ POPUP
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("📨 Nhận message:", request.type);

  if (request.type === "GET_DOM") {
    const structure = getPageStructure();
    console.log("📄 Đã quét trang:", structure.elementsCount, "phần tử");
    sendResponse(structure);
  } 
  else if (request.type === "RUN_JSON") {
    // Chạy async và gửi response
    executeJSON(request.data).then(result => {
      sendResponse(result);
    });
    return true; // Giữ kênh message mở cho async response
  }
  else if (request.type === "PING") {
    sendResponse({ status: "alive" });
  }

  return true;
});

// Thông báo đã load xong
console.log("🤖 AI Form Automator - Content Script đã sẵn sàng!");
