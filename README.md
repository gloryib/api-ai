# HieuBiet.Net - AI Assistant

🧠 **Trợ lý AI thông minh** giống ChatGPT với khả năng tự động phát hiện ngôn ngữ và trả lời tương ứng!

## ✨ Tính năng

- 🌐 **Đa ngôn ngữ**: Tự động phát hiện và trả lời bằng ngôn ngữ người dùng sử dụng
- 📸 **Upload ảnh**: Hỗ trợ phân tích và mô tả hình ảnh (JPG, PNG, GIF, WebP)
- 💬 **Real-time chat**: Socket.IO cho trải nghiệm chat mượt mà
- 📱 **Responsive design**: Tương thích mobile và desktop
- 💾 **Lịch sử chat**: Tự động lưu và quản lý cuộc hội thoại.Net - AI Assistant

Một ứng dụng web AI thông minh được xây dựng bằng Node.js, tích hợp Gemini API và OpenAI API, đặc biệt tối ưu cho tiếng Việt.

## Tính năng

- �🇳 **Tự động trả lời bằng tiếng Việt** dù hỏi bằng ngôn ngữ nào
- �🎨 Giao diện đẹp, hiện đại giống ChatGPT
- 💬 Chat real-time với AI thông qua Socket.IO
- � **Hỗ trợ upload và phân tích ảnh** 
- �📱 Responsive design (hỗ trợ mobile)
- 💾 Lưu lịch sử cuộc trò chuyện
- ⚡ Typing indicator khi AI đang trả lời
- 🔒 Hỗ trợ markdown formatting
- � **Sử dụng miễn phí với Gemini API**

## Cài đặt

### 1. Clone hoặc tải project

```bash
cd ai-api
```

### 2. Cài đặt dependencies

```bash
npm install
```

### 3. Cấu hình OpenAI API Key

Sửa file `.env` và thêm API key của bạn:

```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

**Cách lấy OpenAI API Key:**
1. Truy cập [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Đăng nhập tài khoản OpenAI
3. Tạo API key mới
4. Copy và paste vào file `.env`

### 4. Chạy ứng dụng

#### Development mode (với nodemon):
```bash
npm run dev
```

#### Production mode:
```bash
npm start
```

### 5. Mở trình duyệt

Truy cập: `http://localhost:3000`

## Cấu trúc Project

```
ai-api/
├── public/
│   ├── index.html      # Giao diện chính
│   ├── style.css       # CSS styling
│   └── script.js       # JavaScript client-side
├── server.js           # Server chính
├── package.json        # Dependencies
├── .env               # Environment variables
└── README.md          # Hướng dẫn này
```

## API Endpoints

### POST `/api/chat`
Chat với AI thông qua HTTP request

**Request body:**
```json
{
  "message": "Hello, how are you?",
  "conversationId": "unique_conversation_id"
}
```

**Response:**
```json
{
  "response": "AI response here",
  "conversationId": "unique_conversation_id"
}
```

## Socket.IO Events

### Client Events
- `chat message`: Gửi tin nhắn tới AI
- `disconnect`: Ngắt kết nối

### Server Events
- `chat response`: Nhận phản hồi từ AI
- `typing`: Hiển thị typing indicator
- `error`: Xử lý lỗi

## Customization

### Thay đổi model AI
Trong `server.js`, dòng 45:
```javascript
model: 'gpt-3.5-turbo', // Thay bằng 'gpt-4' nếu muốn
```

### Thay đổi max tokens
Trong `server.js`, dòng 47:
```javascript
max_tokens: 1000, // Tăng giảm theo nhu cầu
```

### Thay đổi màu sắc theme
Trong `public/style.css`, tìm các CSS variables:
```css
:root {
  --primary-color: #10a37f;
  --background-color: #343541;
  --sidebar-color: #202123;
}
```

## Troubleshooting

### Lỗi "API key not provided"
- Kiểm tra file `.env` có chứa `OPENAI_API_KEY`
- Đảm bảo API key hợp lệ và có credit

### Lỗi "Module not found"
```bash
npm install
```

### Port đã được sử dụng
Thay đổi port trong file `.env`:
```
PORT=3001
```

### Lỗi CORS
Nếu gặp lỗi CORS, kiểm tra cấu hình trong `server.js`

## Performance Tips

1. **Limit conversation history**: Để tránh token limit, giới hạn số lượng tin nhắn trong lịch sử
2. **Use streaming**: Implement streaming response cho trải nghiệm tốt hơn
3. **Add caching**: Cache các câu trả lời thường gặp
4. **Rate limiting**: Thêm rate limiting để tránh spam

## License

MIT License

## Support

Nếu gặp vấn đề, hãy tạo issue trong repository hoặc liên hệ support.

## Tác giả

Được phát triển với ❤️ bởi AI Assistant
