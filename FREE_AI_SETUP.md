# 🆓 Hướng dẫn lấy Gemini API Key miễn phí

## Bước 1: Truy cập Google AI Studio
Vào: **https://makersuite.google.com/app/apikey**

## Bước 2: Đăng nhập
- Đăng nhập bằng tài khoản Google của bạn

## Bước 3: Tạo API Key
- Click **"Create API Key"**
- Chọn project hoặc tạo project mới
- Copy API key được tạo

## Bước 4: Cập nhật file .env
Mở file `.env` và thay đổi:
```
GEMINI_API_KEY=your_api_key_here
AI_PROVIDER=gemini
```

## Bước 5: Khởi động lại server
```bash
npm start
```

## ✅ Ưu điểm Gemini API:
- **Hoàn toàn miễn phí** 
- **15 requests/phút** (đủ để test)
- **1500 requests/ngày** 
- **Chất lượng tốt** (comparable với GPT-3.5)
- **Hỗ trợ tiếng Việt** rất tốt

## 🔄 Các AI Provider khác:

### Groq API (Siêu nhanh, miễn phí):
```
# Lấy key tại: https://console.groq.com/keys
GROQ_API_KEY=your_groq_key
AI_PROVIDER=groq
```

### Hugging Face (Nhiều model):
```
# Lấy key tại: https://huggingface.co/settings/tokens  
HUGGINGFACE_API_KEY=your_hf_key
AI_PROVIDER=huggingface
```

## 🚀 Khuyến nghị:
1. **Gemini** - Tốt nhất cho bắt đầu (miễn phí, ổn định)
2. **Groq** - Nhanh nhất (miễn phí, 6000 req/phút)
3. **OpenAI** - Chất lượng cao nhất (có phí)

Chọn provider phù hợp với nhu cầu của bạn!
