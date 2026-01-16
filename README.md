# 🤖 AI Form Automator

Tự động điền form bằng JSON từ AI - An toàn, không eval(), tuân thủ Manifest V3.

## 📁 Cấu trúc dự án

```
form_solver_ai_craft/
├── manifest.json      # Cấu hình extension (MV3)
├── content.js         # Quét DOM & thực thi JSON
├── popup.html         # Giao diện người dùng
├── popup.js           # Logic kết nối UI-Content Script
├── icons/             # Icons cho extension
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # File này
```

## 🚀 Cài đặt

1. Mở Chrome, vào `chrome://extensions/`
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục `form_solver_ai_craft`
5. Extension sẽ xuất hiện trên toolbar

## 📖 Cách sử dụng

### Bước 1: Copy cấu trúc trang
1. Mở trang web cần điền form (Google Form, trang đăng nhập, v.v.)
2. Click icon extension trên toolbar
3. Bấm nút **"📋 Copy Prompt cho AI"**
4. Prompt đã được copy vào clipboard

### Bước 2: Hỏi AI
1. Mở ChatGPT, Claude, hoặc AI khác
2. Dán (Ctrl+V) prompt vừa copy
3. Sửa phần `[MÔ TẢ HÀNH ĐỘNG CỦA BẠN TẠI ĐÂY]` thành yêu cầu cụ thể
   - Ví dụ: "Điền email abc@gmail.com, password 123456, rồi bấm nút Login"
4. AI sẽ trả về một đoạn JSON

### Bước 3: Chạy JSON
1. Copy đoạn JSON từ AI
2. Quay lại extension popup
3. Dán vào ô text
4. Bấm **"▶️ Chạy JSON"**
5. Xem extension tự động điền form!

## 🎯 Các Action hỗ trợ

| Action | Mô tả | Ví dụ |
|--------|-------|-------|
| `fill` | Điền text vào input | `{ "action": "fill", "tempId": "ai_0", "value": "Hello" }` |
| `click` | Click vào phần tử | `{ "action": "click", "tempId": "ai_5" }` |
| `select` | Chọn option trong dropdown | `{ "action": "select", "tempId": "ai_2", "value": "option1" }` |
| `check` | Check/uncheck checkbox | `{ "action": "check", "tempId": "ai_3", "value": true }` |
| `wait` | Đợi (ms) | `{ "action": "wait", "value": 1000 }` |
| `focus` | Focus vào phần tử | `{ "action": "focus", "tempId": "ai_1" }` |
| `submit` | Submit form | `{ "action": "submit", "selector": "form" }` |

## 🔍 Cách xác định phần tử

Bạn có thể dùng một trong các cách sau:

```json
{ "action": "click", "id": "submitBtn" }           // Bằng ID
{ "action": "fill", "tempId": "ai_5", "value": "x" } // Bằng tempId (do extension tạo)
{ "action": "fill", "name": "email", "value": "x" }  // Bằng name attribute
{ "action": "click", "selector": "button.primary" }  // Bằng CSS selector
```

## ⌨️ Phím tắt

- `Ctrl + Enter` - Chạy JSON
- `Ctrl + Shift + C` - Copy cấu trúc trang

## 🔒 Tại sao an toàn?

1. **Không dùng eval()** - Chỉ sử dụng các API DOM tiêu chuẩn
2. **Kiểm soát hoàn toàn** - Bạn nhìn thấy JSON trước khi chạy
3. **Tuân thủ MV3** - Không có remote code execution
4. **Minh bạch** - Highlight phần tử đang thao tác

## 📝 Ví dụ JSON hoàn chỉnh

```json
[
  { "action": "fill", "tempId": "ai_2", "value": "john@example.com" },
  { "action": "fill", "tempId": "ai_5", "value": "SecurePassword123!" },
  { "action": "wait", "value": 500 },
  { "action": "check", "tempId": "ai_8", "value": true },
  { "action": "click", "tempId": "ai_10" }
]
```

## 🐛 Xử lý lỗi thường gặp

### "Không thể kết nối với trang"
→ Reload trang web và thử lại

### "JSON không hợp lệ"
→ Kiểm tra AI có trả về markdown code block không, xóa phần ` ```json ` và ` ``` `

### "Element not found"
→ Trang web có thể đã thay đổi, thử Copy lại cấu trúc và hỏi AI lần nữa

## 📄 License

MIT - Tự do sử dụng và chỉnh sửa.
