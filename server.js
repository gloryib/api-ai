const express = require('express');
const xss = require('xss');
const rateLimit = require('express-rate-limit');
// Dynamic import fileTypeFromBuffer cho CommonJS
let fileTypeFromBuffer;
async function getFileTypeFromBuffer(buffer) {
  if (!fileTypeFromBuffer) {
    const ft = await import('file-type');
    fileTypeFromBuffer = ft.fileTypeFromBuffer;
  }
  return fileTypeFromBuffer(buffer);
}
const cors = require('cors');
const csurf = require('csurf');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Minimal Cloudflare Flexible SSL support
  transports: ['polling', 'websocket'], // Polling first
  allowEIO3: true,
  // Handle mixed HTTP/HTTPS
  allowRequest: (req, callback) => {
    // Allow all requests (Cloudflare proxy safe)
    callback(null, true);
  }
});

const PORT = process.env.PORT || 3000;

// Middleware chặn request bất thường
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  // Chặn User-Agent rỗng hoặc chứa từ khóa bot, curl, python, http
  const suspicious = !userAgent || /(bot|curl|python|http|wget|scrapy|spider)/i.test(userAgent);
  // Có thể thêm blacklist IP tại đây nếu muốn
  if (suspicious) {
    console.warn(`Blocked suspicious request from IP: ${ip}, UA: ${userAgent}`);
    return res.status(403).json({ error: 'Request bị chặn vì nghi ngờ tự động hoặc bot.' });
  }
  next();
});

// Rate limit: tối đa 10 request mỗi phút cho mỗi IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 10, // tối đa 10 request
  message: {
    error: 'Bạn gửi quá nhiều tin nhắn, vui lòng thử lại sau!'
  }
});

// Rate limit upload: tối đa 5 lần upload mỗi phút cho mỗi IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    error: 'Bạn upload quá nhiều file, vui lòng thử lại sau!'
  }
});

// Trust proxy for Cloudflare/reverse proxies
app.set('trust proxy', 1);

// Middleware
// Thiết lập CORS chỉ cho phép từ origin hợp lệ (ví dụ: http://localhost:3000 hoặc domain của bạn)
app.use(cors({
  origin: ["http://localhost:3000", "https://hieubiet.net"],
  credentials: true
}));
app.use(bodyParser.json());
// CSRF protection cho các request POST/quan trọng
const csrfProtection = csurf({ cookie: true });
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use(express.static('public'));
// Áp dụng rate limit cho endpoint upload
app.use('/api/upload', uploadLimiter);
app.use('/api/upload', csrfProtection);

// Áp dụng rate limit cho endpoint chat
app.use('/api/chat', chatLimiter);
app.use('/api/chat', csrfProtection);

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadsDir);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Chỉ cho phép jpg, jpeg, png, gif, webp
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận file ảnh JPG, PNG, GIF, WEBP!'), false);
    }
    cb(null, true);
  }
});

// Initialize AI providers
const AI_PROVIDER = process.env.AI_PROVIDER || 'gemini';
console.log('Using AI Provider:', AI_PROVIDER);

let openai, geminiAI, geminiModel;

// Initialize OpenAI
if (process.env.OPENAI_API_KEY) {
  console.log('Initializing OpenAI with API key:', process.env.OPENAI_API_KEY ? 'API key found' : 'NO API KEY');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Initialize Gemini
if (process.env.GEMINI_API_KEY) {
  console.log('Initializing Gemini with API key:', process.env.GEMINI_API_KEY ? 'API key found' : 'NO API KEY');
  geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = geminiAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

// AI Chat function
async function getChatResponse(messages, imagePath = null) {
  const lastMessage = messages[messages.length - 1].content;
  
  if (AI_PROVIDER === 'gemini' && geminiModel) {
    try {
      // System prompt for markdown response
      let prompt = `Bạn là một AI assistant thông minh và hữu ích. Hãy phát hiện ngôn ngữ mà người dùng sử dụng và trả lời bằng chính ngôn ngữ đó. Nếu người dùng hỏi bằng tiếng Việt thì trả lời bằng tiếng Việt. Nếu hỏi bằng tiếng Anh thì trả lời bằng tiếng Anh.

QUAN TRỌNG: Hãy trả lời bằng Markdown format:
- Sử dụng **text** cho chữ đậm
- Sử dụng *text* cho chữ nghiêng  
- Sử dụng \`code\` cho inline code
- Sử dụng \`\`\`language\ncode\n\`\`\` cho code blocks
- KHÔNG sử dụng HTML tags như <code>, <p>, <br>, <strong>, <em>

\n\n`;
      
      // Add conversation context
      messages.forEach(msg => {
        if (msg.role === 'user') {
          prompt += `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n`;
        }
      });
      
      // Add final instruction
      prompt += `\nHãy trả lời câu hỏi trên bằng cùng ngôn ngữ mà người dùng sử dụng một cách chi tiết và hữu ích:`;
      
      // If image is provided, analyze it with text
      if (imagePath && fs.existsSync(imagePath)) {
        const imageData = await fs.readFile(imagePath);
        const imagePart = {
          inlineData: {
            data: imageData.toString('base64'),
            mimeType: getMimeType(imagePath)
          }
        };
        
        const result = await geminiModel.generateContent([prompt, imagePart]);
        const response = await result.response;
        return response.text();
      } else {
        // Text only
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw error;
    }
    
  } else if (AI_PROVIDER === 'openai' && openai) {
    // Add system message for markdown response
    const systemMessage = {
      role: 'system',
      content: `Bạn là một AI assistant thông minh và hữu ích. Hãy phát hiện ngôn ngữ mà người dùng sử dụng và trả lời bằng chính ngôn ngữ đó. Nếu người dùng hỏi bằng tiếng Việt thì trả lời bằng tiếng Việt. Nếu hỏi bằng tiếng Anh thì trả lời bằng tiếng Anh.

QUAN TRỌNG: Hãy trả lời bằng Markdown format:
- Sử dụng **text** cho chữ đậm
- Sử dụng *text* cho chữ nghiêng  
- Sử dụng \`code\` cho inline code
- Sử dụng \`\`\`language
code
\`\`\` cho code blocks
- KHÔNG sử dụng HTML tags như <code>, <p>, <br>, <strong>, <em>`
    };
    
    const messagesWithSystem = [systemMessage, ...messages];
    
    // OpenAI doesn't support images in GPT-4o, would need GPT-4-vision
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messagesWithSystem,
      max_tokens: 1000,
      temperature: 0.7,
    });
    return completion.choices[0].message.content;
    
  } else {
    throw new Error(`AI Provider '${AI_PROVIDER}' not configured or API key missing`);
  }
}

// Helper function to get MIME type
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// Formatting functions (moved from frontend)
function escapeHtml(text) {
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
}

function formatAIResponse(content) {
  // First, handle code blocks BEFORE basic formatting
  let formatted = content.replace(/```(\w+)?\s*([\s\S]*?)```/g, function(match, lang, code) {
    const language = lang || 'text';
    const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
    const escapedCode = escapeHtml(code.trim());
    
    return `<div class="code-block-wrapper">
<pre class="language-${language}" data-language="${language}">
<code id="${codeId}">${escapedCode}</code>
</pre>
<button class="copy-code-btn" onclick="copyCodeToClipboard('${codeId}', this)">
<i class="fas fa-copy"></i> Copy
</button>
</div>`;
  });
  // Tự động xuống dòng cho các danh sách số (1., 2., ...), nhưng KHÔNG thay đổi <ul>, <ol>, <li>
  // Nếu đã có <ul> hoặc <ol> thì giữ nguyên, chỉ xử lý text thường
  if (!/<ul>|<ol>/i.test(formatted)) {
    formatted = formatted.replace(/(\d+\.)(?=\s)/g, '<br>$1');
  }

  // Check if we need paragraphs BEFORE applying paragraph formatting
  const needsParagraphs = /\n\s*\n/.test(formatted.replace(/<div class="code-block-wrapper">[\s\S]*?<\/div>/g, ''));
  
  // Then apply basic markdown formatting
  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
    .replace(/`([^`]+)`/g, '<code>$1</code>'); // Inline code
    
  // Only apply paragraph formatting if needed
  if (needsParagraphs) {
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    return `<p>${formatted}</p>`;
  }
  
  // For simple responses, just replace single newlines with <br>
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

// Store conversation history
const conversations = new Map();

// Routes
// Health check endpoint for Cloudflare
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    cloudflare: {
      'cf-ray': req.headers['cf-ray'] || 'not-detected',
      'cf-connecting-ip': req.headers['cf-connecting-ip'] || 'not-detected',
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'not-detected'
    }
  });
});

// Socket.IO test endpoint
app.get('/socket-test', (req, res) => {
  const connectedSockets = io.engine.clientsCount;
  res.json({
    socketio: {
      status: 'running',
      connected_clients: connectedSockets,
      transport_types: ['polling', 'websocket'],
      path: '/socket.io/',
      cors_enabled: true
    },
    server: {
      protocol: req.protocol,
      secure: req.secure,
      headers: {
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        host: req.headers.host
      }
    },
    test_urls: {
      polling: `${req.protocol}://${req.headers.host}/socket.io/?EIO=4&transport=polling`,
      websocket: `${req.secure ? 'wss' : 'ws'}://${req.headers.host}/socket.io/?EIO=4&transport=websocket`
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Upload image route
app.post('/api/upload', upload.single('image'), csrfProtection, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được tải lên' });
    }
    // Kiểm tra nội dung file thực sự là ảnh
    fs.readFile(req.file.path)
      .then(async buffer => {
        try {
          const type = await getFileTypeFromBuffer(buffer);
          if (!type) {
            console.warn('Cảnh báo: file-type không nhận diện được file', req.file.originalname);
            // Vẫn cho phép upload nếu MIME type hợp lệ
          } else if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type.ext)) {
            // Xóa file giả mạo
            await fs.unlink(req.file.path);
            return res.status(400).json({ error: 'File upload không phải là ảnh hợp lệ!' });
          }
          const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`
          };
          console.log('File uploaded:', fileInfo);
          res.json({ success: true, file: fileInfo });
        } catch (err) {
          console.warn('Cảnh báo: file-type lỗi khi kiểm tra file', req.file.originalname, err);
          // Vẫn cho phép upload nếu MIME type hợp lệ
          const fileInfo = {
            filename: req.file.filename,
            originalname: req.file.originalname,
            path: req.file.path,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`
          };
          res.json({ success: true, file: fileInfo });
        }
      })
      .catch(error => {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Lỗi khi tải file lên' });
      });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Lỗi khi tải file lên' });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

app.post('/api/chat', csrfProtection, async (req, res) => {
// Endpoint để lấy CSRF token cho frontend
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
  try {
    let { message, conversationId } = req.body;
    // Lọc nội dung đầu vào chống XSS
    message = xss(message);
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    // Get or create conversation history
    let conversation = conversations.get(conversationId) || [];
    // Add user message đã lọc vào conversation
    conversation.push({ role: 'user', content: message });
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: conversation,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    
    // Add AI response to conversation
    conversation.push({ role: 'assistant', content: aiResponse });
    
    // Store updated conversation
    conversations.set(conversationId, conversation);
    
    res.json({ 
      response: aiResponse,
      conversationId: conversationId 
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Đã có lỗi xảy ra khi xử lý yêu cầu của bạn.' 
    });
  }
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('chat message', async (data) => {
    try {
      const { message, conversationId, imageUrl } = data;
      console.log('Received message:', message, 'for conversation:', conversationId);
      if (imageUrl) console.log('With image:', imageUrl);
      
      // Get or create conversation history
      let conversation = conversations.get(conversationId) || [];
      
      // Add user message
      conversation.push({ role: 'user', content: message });
      
      // Emit typing indicator
      socket.emit('typing', true);
      
      let aiResponse;
      
      try {
        console.log('Calling AI API...');
        
        // If image is provided, get the local file path
        let imagePath = null;
        if (imageUrl) {
          const filename = path.basename(imageUrl);
          imagePath = path.join(uploadsDir, filename);
        }
        
        aiResponse = await getChatResponse(conversation, imagePath);
        console.log('AI response:', aiResponse);
        
      } catch (apiError) {
        console.error('AI API Error:', apiError.message);
        
        // Fallback response when API fails
        if (apiError.code === 'insufficient_quota' || apiError.message.includes('quota')) {
          aiResponse = `🚨 **API Quota đã hết!**

Xin lỗi, tài khoản ${AI_PROVIDER.toUpperCase()} đã hết credit. Để tiếp tục sử dụng:

1. **Kiểm tra billing:** ${AI_PROVIDER === 'openai' ? 'https://platform.openai.com/usage' : 'https://makersuite.google.com'}
2. **Nạp thêm credit** hoặc **đổi sang AI provider khác**
3. **Hoặc tạo tài khoản mới** để nhận free credit

**Tin nhắn của bạn:** "${message}"
${imageUrl ? `**Ảnh đã tải:** ${imageUrl}` : ''}

**Mock response:** Tôi đã nhận được tin nhắn của bạn${imageUrl ? ' và ảnh đính kèm' : ''}. Giao diện hoạt động tốt, chỉ cần cấu hình AI API!`;
        } else {
          aiResponse = `Xin lỗi, đã có lỗi xảy ra với ${AI_PROVIDER.toUpperCase()} API: ${apiError.message}

**Có thể thử:**
1. Kiểm tra API key trong file .env
2. Đổi sang AI provider khác (gemini, openai)
3. Hoặc tạo API key mới

**Mock response cho "${message}"${imageUrl ? ' (có ảnh đính kèm)' : ''}:** Đây là phản hồi giả lập khi API gặp lỗi.`;
        }
      }
      
      // Add AI response
      conversation.push({ role: 'assistant', content: aiResponse });
      conversations.set(conversationId, conversation);
      
      // Format AI response on server side
      const formattedResponse = formatAIResponse(aiResponse);
      
      // Stop typing indicator and send response
      socket.emit('typing', false);
      socket.emit('chat response', {
        response: formattedResponse,
        conversationId: conversationId
      });

    } catch (error) {
      console.error('Socket error:', error);
      socket.emit('typing', false);
      socket.emit('error', 'Đã có lỗi xảy ra khi xử lý tin nhắn: ' + error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 HieuBiet.Net AI Assistant is running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} to view the application`);
  console.log(`� AI Provider: ${AI_PROVIDER.toUpperCase()} - Responds in user's language`);
});
