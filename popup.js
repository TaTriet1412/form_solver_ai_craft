// popup.js - Logic kết nối giữa Popup UI và Content Script

// DOM Elements
const btnCopyContext = document.getElementById('btnCopyContext');
const btnRun = document.getElementById('btnRun');
const jsonInput = document.getElementById('jsonInput');
const statusDiv = document.getElementById('status');

// Helper: Hiển thị status
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  // Tự ẩn sau 5 giây
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 5000);
  }
}

// Helper: Kiểm tra content script đã load chưa
async function checkContentScriptReady(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
      } else {
        resolve(response && response.status === "alive");
      }
    });
  });
}

// Helper: Inject content script nếu chưa có
async function ensureContentScript(tab) {
  const isReady = await checkContentScriptReady(tab.id);
  
  if (!isReady) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Đợi một chút để script load
      await new Promise(r => setTimeout(r, 300));
      return true;
    } catch (error) {
      console.error("Không thể inject script:", error);
      return false;
    }
  }
  
  return true;
}

// ============================================
// 1. XỬ LÝ NÚT COPY CONTEXT
// ============================================
btnCopyContext.addEventListener('click', async () => {
  btnCopyContext.disabled = true;
  btnCopyContext.innerHTML = '<span class="loading"></span> Đang quét...';
  
  try {
    // Lấy tab hiện tại
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus("❌ Không tìm thấy tab hiện tại!", "error");
      return;
    }

    // Kiểm tra URL có hợp lệ không
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showStatus("❌ Không thể chạy trên trang Chrome nội bộ!", "error");
      return;
    }

    // Đảm bảo content script đã được inject
    const scriptReady = await ensureContentScript(tab);
    if (!scriptReady) {
      showStatus("❌ Không thể kết nối với trang. Hãy reload trang web!", "error");
      return;
    }

    // Gửi lệnh lấy DOM
    chrome.tabs.sendMessage(tab.id, { type: "GET_DOM" }, (domData) => {
      if (chrome.runtime.lastError) {
        showStatus("❌ Lỗi: " + chrome.runtime.lastError.message, "error");
        return;
      }

      if (!domData || !domData.elements) {
        showStatus("❌ Không nhận được dữ liệu. Hãy reload trang!", "error");
        return;
      }

      // Tạo prompt cho AI
      const isGoogleForms = domData.isGoogleForms || domData.url.includes('google.com/forms');
      
      let promptForAI = `Tôi muốn tự động điền đáp án trên trang web.

📍 URL: ${domData.url}
📄 Tiêu đề: ${domData.title}
🔢 Số phần tử: ${domData.elementsCount}
${isGoogleForms ? '📋 Loại trang: Google Forms' : ''}

🗺️ DOM MAP (các phần tử có thể tương tác):
${JSON.stringify(domData.elements, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 YÊU CẦU CỦA TÔI:
Hãy trả lời các CÂU HỎI KIẾN THỨC trong form này. Chọn đáp án đúng cho các câu hỏi trắc nghiệm.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 HƯỚNG DẪN TRẢ LỜI:
⚠️ BẮT BUỘC: Trả về mảng JSON bên trong code block \`\`\`json để có nút COPY!
⛔ KHÔNG BAO GỒM ACTION SUBMIT/GỬI FORM - Chỉ điền đáp án, người dùng sẽ tự submit!
⛔ KHÔNG giải thích dài dòng - CHỈ trả về code block JSON!

🚫 BỎ QUA CÁC CÂU HỎI YÊU CẦU THÔNG TIN CÁ NHÂN CỦA NGƯỜI LÀM FORM (KHÔNG tạo action):
- "Họ tên của bạn", "Nhập tên của bạn", "Tên học sinh/sinh viên"
- "Email của bạn", "Địa chỉ email", "Gmail"
- "Số điện thoại của bạn", "Phone", "Mobile"
- "Mã số sinh viên", "MSSV", "Mã học sinh"
- "Lớp của bạn", "Khoa", "Trường", "Địa chỉ của bạn"
- "Ngày sinh", "Năm sinh", "Giới tính của bạn"
→ Đặc điểm: câu hỏi YÊU CẦU NGƯỜI LÀM FORM CUNG CẤP thông tin về bản thân họ

✅ VẪN PHẢI TRẢ LỜI các câu hỏi kiến thức có liên quan đến TÊN NGƯỜI:
- "Ai phát minh ra bóng đèn?" → "Thomas Edison"
- "Tên nhà khoa học nào tìm ra thuyết tương đối?" → "Albert Einstein"
- "Vị vua nào khai sáng triều Nguyễn?" → "Gia Long"
- "Tác giả Truyện Kiều là ai?" → "Nguyễn Du"
→ Đặc điểm: câu hỏi về KIẾN THỨC LỊCH SỬ/KHOA HỌC/VĂN HÓA, có đáp án cụ thể

✅ CHỈ TRẢ LỜI:
- Câu hỏi trắc nghiệm (radio button - chọn 1 đáp án)
- Câu hỏi checkbox (chọn nhiều đáp án)
- Câu hỏi điền chữ/số có câu trả lời cụ thể (ví dụ: "Thủ đô Việt Nam là gì?" → "Hà Nội")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 CÁC ACTION HỖ TRỢ:
1. Radio button (chọn 1): { "action": "click", "qIndex": 0, "dataValue": "đáp án" }
2. Checkbox (chọn nhiều): { "action": "click", "qIndex": 0, "dataValue": "đáp án 1" } (lặp lại cho mỗi đáp án cần chọn)
3. Điền text: { "action": "fill", "qIndex": 0, "value": "nội dung trả lời" }
4. Dropdown: { "action": "select", "id": "element_id", "value": "option_value" }
5. Đợi: { "action": "wait", "value": 1000 }

${isGoogleForms ? `⚠️ QUAN TRỌNG CHO GOOGLE FORMS:
- Mỗi element có "qIndex" (index câu hỏi: 0, 1, 2...) và "dataValue" (nội dung đáp án)
- PHẢI dùng CẢ HAI: "qIndex" + "dataValue" để tránh nhầm khi 2 câu có đáp án giống nhau!
- Với checkbox: tạo 1 action click cho MỖI đáp án cần chọn
- Với câu điền chữ: dùng "fill" với qIndex và value` : ''}

VÍ DỤ OUTPUT - PHẢI CÓ CODE BLOCK:
\`\`\`json
[
  { "action": "click", "qIndex": 0, "dataValue": "Đáp án A" },
  { "action": "click", "qIndex": 1, "dataValue": "Lựa chọn 1" },
  { "action": "click", "qIndex": 1, "dataValue": "Lựa chọn 3" },
  { "action": "fill", "qIndex": 2, "value": "Hà Nội" }
]
\`\`\``;

      // Copy vào clipboard
      navigator.clipboard.writeText(promptForAI).then(() => {
        showStatus(`✅ Đã copy prompt! (${domData.elementsCount} phần tử)\n👉 Dán vào Gemini ngay!`, "success");
      }).catch(err => {
        showStatus("❌ Không thể copy: " + err.message, "error");
      });
    });

  } catch (error) {
    showStatus("❌ Lỗi: " + error.message, "error");
  } finally {
    btnCopyContext.disabled = false;
    btnCopyContext.innerHTML = '<span class="emoji">📋</span> Copy Prompt cho AI';
  }
});

// ============================================
// 2. XỬ LÝ NÚT CHẠY JSON
// ============================================
btnRun.addEventListener('click', async () => {
  const jsonStr = jsonInput.value.trim();
  
  // Validate input
  if (!jsonStr) {
    showStatus("⚠️ Vui lòng dán JSON từ AI vào ô text!", "error");
    return;
  }

  // Parse JSON
  let jsonData;
  try {
    // Thử clean JSON nếu có markdown code block
    let cleanJson = jsonStr;
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    
    jsonData = JSON.parse(cleanJson);
  } catch (e) {
    showStatus("❌ JSON không hợp lệ! Lỗi: " + e.message, "error");
    return;
  }

  // Validate structure
  if (!Array.isArray(jsonData)) {
    showStatus("❌ JSON phải là một mảng (array)!", "error");
    return;
  }

  if (jsonData.length === 0) {
    showStatus("⚠️ Mảng JSON rỗng, không có gì để thực thi!", "error");
    return;
  }

  // Disable button và hiển thị loading
  btnRun.disabled = true;
  btnRun.innerHTML = '<span class="loading"></span> Đang chạy...';
  showStatus(`🔄 Đang thực thi ${jsonData.length} bước...`, "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus("❌ Không tìm thấy tab!", "error");
      return;
    }

    // Đảm bảo content script đã sẵn sàng
    const scriptReady = await ensureContentScript(tab);
    if (!scriptReady) {
      showStatus("❌ Không thể kết nối. Hãy reload trang!", "error");
      return;
    }

    // Gửi lệnh chạy JSON
    chrome.tabs.sendMessage(tab.id, { type: "RUN_JSON", data: jsonData }, (result) => {
      if (chrome.runtime.lastError) {
        showStatus("❌ Lỗi: " + chrome.runtime.lastError.message, "error");
        return;
      }

      if (result && result.success) {
        showStatus(`✅ Hoàn thành! ${result.completed}/${result.total} bước thành công.`, "success");
      } else if (result) {
        showStatus(`⚠️ Hoàn thành với lỗi: ${result.completed}/${result.total} thành công, ${result.failed} thất bại.`, "error");
      } else {
        showStatus("✅ Đã gửi lệnh thực thi!", "success");
      }
    });

  } catch (error) {
    showStatus("❌ Lỗi: " + error.message, "error");
  } finally {
    btnRun.disabled = false;
    btnRun.innerHTML = '<span class="emoji">▶️</span> Chạy JSON';
  }
});

// ============================================
// 3. AUTO-VALIDATE JSON KHI NHẬP
// ============================================
jsonInput.addEventListener('input', () => {
  const value = jsonInput.value.trim();
  
  if (!value) {
    jsonInput.style.borderColor = '#e0e0e0';
    return;
  }

  try {
    let cleanJson = value;
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    
    const parsed = JSON.parse(cleanJson);
    
    if (Array.isArray(parsed)) {
      jsonInput.style.borderColor = '#38ef7d'; // Green = valid
    } else {
      jsonInput.style.borderColor = '#ffc107'; // Yellow = valid but not array
    }
  } catch (e) {
    jsonInput.style.borderColor = '#ff6b6b'; // Red = invalid
  }
});

// ============================================
// 4. KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter = Run JSON
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    btnRun.click();
  }
  
  // Ctrl+Shift+C = Copy Context
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    btnCopyContext.click();
  }
});

// Hiển thị hướng dẫn khi mở popup
console.log("🤖 AI Form Automator - Popup loaded!");
console.log("Phím tắt: Ctrl+Enter = Chạy JSON | Ctrl+Shift+C = Copy Context");
