// Initialize Socket.IO
console.log('Initializing Socket.IO...');
const socket = io({
    // Cloudflare Flexible SSL compatible
    transports: ['polling', 'websocket'], // Try polling first
    upgrade: true, // Allow upgrade to websocket
    // Timeout for proxy environments
    timeout: 20000
});

// Socket.IO connection monitoring
socket.on('connect', () => {
    console.log('✅ Socket.IO connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('❌ Socket.IO disconnected:', reason);
});

socket.on('connect_error', (error) => {
    console.error('❌ Socket.IO connection error:', error);
});

// Global variables
let currentConversationId = localStorage.getItem('currentConversationId') || null;
let conversations = new Map();
let isTyping = false;
let currentImageFile = null;
let currentImageUrl = null;
let isAutoScrolling = true;
let hasNewMessage = false;

console.log('Current conversation ID:', currentConversationId);

// DOM Elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');
const sidebar = document.getElementById('sidebar');
const chatHistoryList = document.getElementById('chat-history-list');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // Debug: Check if all DOM elements are found
    console.log('DOM Elements check:');
    console.log('chatMessages:', chatMessages ? '✅' : '❌');
    console.log('messageInput:', messageInput ? '✅' : '❌');
    console.log('sendButton:', sendButton ? '✅' : '❌');
    console.log('typingIndicator:', typingIndicator ? '✅' : '❌');
    
    if (!messageInput || !sendButton) {
        console.error('❌ Critical DOM elements not found!');
        return;
    }
    
    // Make sure functions are available globally for HTML onclick
    window.toggleSidebar = toggleSidebar;
    window.startNewChat = startNewChat;
    window.openImageModal = openImageModal;
    window.removeImage = removeImage;
    window.deleteConversation = deleteConversation;
    window.clearAllHistory = clearAllHistory;
    window.cleanupInvalidConversations = cleanupInvalidConversations;
    window.copyCodeToClipboard = copyCodeToClipboard;
    
    // First load conversations from localStorage
    loadConversationsFromStorage();
    
    // Then set up everything else
    setupEventListeners();
    loadChatHistory();
    setupScrollListener();
    restoreSidebarState();
    
    // Focus on input
    messageInput.focus();
    
    // Add responsive handler
    setupResponsiveHandler();
    
    console.log('App initialized. Current conversation ID:', currentConversationId);
    console.log('Total conversations loaded:', conversations.size);
});

// Setup responsive behavior
function setupResponsiveHandler() {
    // Handle window resize
    window.addEventListener('resize', handleResponsiveLayout);
    
    // Initial check
    handleResponsiveLayout();
}

// Handle responsive layout changes
function handleResponsiveLayout() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // On mobile, always hide sidebar by default unless user explicitly opened it
        const userExplicitlyOpened = localStorage.getItem('sidebarExplicitlyOpened') === 'true';
        if (!userExplicitlyOpened) {
            sidebar.classList.add('hidden');
            localStorage.setItem('sidebarHidden', 'true');
        }
    } else {
        // On desktop, restore normal sidebar state
        const sidebarHidden = localStorage.getItem('sidebarHidden') === 'true';
        if (sidebarHidden) {
            sidebar.classList.add('hidden');
        } else {
            sidebar.classList.remove('hidden');
        }
        // Clear explicit open flag on desktop
        localStorage.removeItem('sidebarExplicitlyOpened');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Send button click event
    sendButton.addEventListener('click', function(e) {
        e.preventDefault();
        sendMessage();
    });

    // Send message on Enter key (Shift+Enter for new line)
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        
        // Enable/disable send button (allow if text OR image)
        sendButton.disabled = (this.value.trim() === '' && !currentImageUrl);
    });

    // Socket event listeners
    socket.on('chat response', handleAIResponse);
    socket.on('typing', handleTyping);
    socket.on('error', handleError);
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// LocalStorage functions for chat history
function saveConversationsToStorage() {
    try {
        const conversationsObj = Object.fromEntries(conversations);
        localStorage.setItem('chatConversations', JSON.stringify(conversationsObj));
        localStorage.setItem('currentConversationId', currentConversationId);
    } catch (error) {
        console.error('Error saving conversations:', error);
    }
}

function loadConversationsFromStorage() {
    try {
        const saved = localStorage.getItem('chatConversations');
        const savedCurrentId = localStorage.getItem('currentConversationId');
        
        if (saved) {
            const conversationsObj = JSON.parse(saved);
            conversations = new Map(Object.entries(conversationsObj));
        }
        
        if (savedCurrentId) {
            currentConversationId = savedCurrentId;
            
            // Check if current conversation is older than 1 hour
            if (conversations.has(currentConversationId)) {
                const conversation = conversations.get(currentConversationId);
                const lastMessageTime = conversation.lastMessageTime || 0;
                const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour in milliseconds
                
                if (lastMessageTime < oneHourAgo) {
                    console.log('Last chat was over 1 hour ago, will start new chat');
                    currentConversationId = null;
                    localStorage.removeItem('currentConversationId');
                }
            }
        }
        
        return conversations.size > 0;
    } catch (error) {
        console.error('Error loading conversations:', error);
        return false;
    }
}

// Handle image selection
async function handleImageSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Vui lòng chọn file ảnh!');
        return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File ảnh quá lớn! Vui lòng chọn file nhỏ hơn 10MB.');
        return;
    }
    
    try {
        // Upload image
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentImageFile = file;
            currentImageUrl = result.file.url;
            
            // Show preview
            previewImage.src = currentImageUrl;
            imagePreview.style.display = 'block';
            
            // Focus on input
            messageInput.focus();
            messageInput.placeholder = 'Mô tả ảnh này hoặc đặt câu hỏi bằng bất kỳ ngôn ngữ nào...';
        } else {
            alert('Lỗi khi tải ảnh lên: ' + (result.error || 'Lỗi không xác định'));
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi khi tải ảnh lên!');
    }
    
    // Clear input
    input.value = '';
}

// Remove selected image
function removeImage() {
    currentImageFile = null;
    currentImageUrl = null;
    imagePreview.style.display = 'none';
    previewImage.src = '';
    messageInput.placeholder = 'Hỏi gì cũng được bằng bất kỳ ngôn ngữ nào...';
}

// Setup scroll listener
function setupScrollListener() {
    chatMessages.addEventListener('scroll', function() {
        const isNearBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 100;
        
        if (isNearBottom) {
            isAutoScrolling = true;
            hideScrollToBottomButton();
        } else {
            isAutoScrolling = false;
            if (hasNewMessage) {
                showScrollToBottomButton();
            }
        }
    });
}

// Show scroll to bottom button
function showScrollToBottomButton() {
    if (scrollToBottomBtn) {
        scrollToBottomBtn.style.display = 'flex';
        scrollToBottomBtn.style.animation = 'slideInUp 0.3s ease';
    }
}

// Hide scroll to bottom button
function hideScrollToBottomButton() {
    if (scrollToBottomBtn) {
        scrollToBottomBtn.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => {
            scrollToBottomBtn.style.display = 'none';
        }, 300);
    }
    hasNewMessage = false;
}

// Improved scroll to bottom function
function scrollToBottom(force = false) {
    if (isAutoScrolling || force) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
        hideScrollToBottomButton();
    }
}

// Check if user is at bottom
function isUserAtBottom() {
    return chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 50;
}

// Send message function
async function sendMessage() {
    const message = messageInput.value.trim();
    console.log('Attempting to send message:', message);
    
    // Allow sending if there's text OR image
    if ((!message && !currentImageUrl) || isTyping) {
        console.log('No message/image or is typing, returning');
        return;
    }
    
    // Create new conversation if needed (first message)
    if (!currentConversationId || !conversations.has(currentConversationId)) {
        console.log('Creating new conversation for first message');
        currentConversationId = generateId();
        const title = message.length > 30 ? message.substring(0, 30) + '...' : message;
        conversations.set(currentConversationId, {
            title: title,
            messages: [],
            lastMessageTime: Date.now() // Add timestamp when conversation is created
        });
        localStorage.setItem('currentConversationId', currentConversationId);
        console.log('New conversation created:', currentConversationId, 'with title:', title);
    } else {
        // Update lastMessageTime for existing conversation
        const conversation = conversations.get(currentConversationId);
        conversation.lastMessageTime = Date.now();
        conversations.set(currentConversationId, conversation);
    }
    
    const messageToSend = message || 'Hãy mô tả ảnh này';
    const imageToSend = currentImageUrl;
    
    // Clear input and image
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;
    removeImage();

    // Hide welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }

    console.log('Sending via socket.io:', { 
        message: messageToSend, 
        conversationId: currentConversationId,
        imageUrl: imageToSend
    });
    
    // Send via Socket.IO for real-time experience
    socket.emit('chat message', {
        message: messageToSend,
        conversationId: currentConversationId,
        imageUrl: imageToSend
    });

    // Add message to chat display
    addMessage(messageToSend, 'user', imageToSend);
    
    // Save user message to conversation (conversation already exists from above)
    const conversation = conversations.get(currentConversationId);
    conversation.messages.push({
        content: message || 'Đã gửi ảnh',
        sender: 'user',
        imageUrl: imageToSend,
        timestamp: Date.now()
    });
    
    console.log('Message saved to conversation, total messages:', conversation.messages.length);
    
    // Save to localStorage and update sidebar
    saveConversationsToStorage();
    updateChatHistory();
}

// Create message element (for loading conversations)
function createMessageElement(content, sender, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Add image if present
    if (imageUrl) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'message-image';
        imageDiv.innerHTML = `<img src="${imageUrl}" alt="Uploaded image" onclick="openImageModal('${imageUrl}')">`;
        contentDiv.appendChild(imageDiv);
    }
    
    // Add text content
    if (content) {
        const textDiv = document.createElement('div');
        if (sender === 'ai') {
            textDiv.innerHTML = formatAIResponse(content);
        } else {
            textDiv.textContent = content;
        }
        contentDiv.appendChild(textDiv);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    return messageDiv;
}

// Add message to chat
function addMessage(content, sender, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Add image if present
    if (imageUrl) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'message-image';
        imageDiv.innerHTML = `<img src="${imageUrl}" alt="Uploaded image" onclick="openImageModal('${imageUrl}')">`;
        contentDiv.appendChild(imageDiv);
    }
    
    // Add text content
    if (content) {
        const textDiv = document.createElement('div');
        if (sender === 'ai') {
            textDiv.innerHTML = content; // Server already formatted the content
        } else {
            textDiv.textContent = content;
        }
        contentDiv.appendChild(textDiv);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // Handle auto-scroll
    const wasAtBottom = isUserAtBottom();
    if (wasAtBottom || sender === 'user') {
        // Always scroll for user messages or when user is at bottom
        setTimeout(() => scrollToBottom(true), 100);
    } else {
        // Show scroll button for AI messages when user is scrolled up
        if (sender === 'ai') {
            hasNewMessage = true;
            showScrollToBottomButton();
        }
    }
}

// Add AI message with typewriter effect
function addMessageWithTypewriter(content, sender, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Add image if present
    if (imageUrl) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'message-image';
        imageDiv.innerHTML = `<img src="${imageUrl}" alt="Uploaded image" onclick="openImageModal('${imageUrl}')">`;
        contentDiv.appendChild(imageDiv);
    }
    
    // Create text container for typewriter effect
    const textDiv = document.createElement('div');
    textDiv.className = 'typewriter-text';
    contentDiv.appendChild(textDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // Start typewriter effect
    if (content) {
        startTypewriterEffect(textDiv, content, sender);
    }

    // Always scroll to bottom when starting typewriter effect for AI responses
    if (sender === 'ai') {
        // Force scroll to show the new AI message immediately
        setTimeout(() => {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }, 50);
    }

    // Handle auto-scroll for user messages
    if (sender === 'user') {
        setTimeout(() => scrollToBottom(true), 100);
    }
}

// Typewriter effect for AI responses
function startTypewriterEffect(textDiv, content, sender) {
    const formattedContent = sender === 'ai' ? content : content; // Server already formatted AI content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedContent;
    
    // Get plain text for typing effect
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    let currentIndex = 0;
    const charsPerFrame = 3; // Characters per animation frame (ultra fast)
    
    function typeNextBatch() {
        if (currentIndex < plainText.length) {
            // Add multiple characters per frame for ultra speed
            const endIndex = Math.min(currentIndex + charsPerFrame, plainText.length);
            const currentText = plainText.substring(0, endIndex);
            
            // For AI messages, format properly
            if (sender === 'ai') {
                const partialFormatted = formatPartialAIResponse(content, endIndex);
                textDiv.innerHTML = partialFormatted + '<span class="typewriter-cursor">_</span>';
            } else {
                textDiv.innerHTML = escapeHtml(currentText) + '<span class="typewriter-cursor">_</span>';
            }
            
            currentIndex = endIndex;
            
            // Force scroll during typing (every few batches) - always scroll when typing
            if (currentIndex % 9 === 0) {
                // Force scroll to bottom during typewriter effect
                chatMessages.scrollTo({
                    top: chatMessages.scrollHeight,
                    behavior: 'smooth'
                });
            }
            
            // Use requestAnimationFrame for smooth 60fps animation
            requestAnimationFrame(typeNextBatch);
        } else {
            // Typing completed - remove cursor and show final formatted content
            if (sender === 'ai') {
                textDiv.innerHTML = content; // Server already formatted the content
            } else {
                textDiv.textContent = plainText;
            }
            
            // Final scroll to ensure user sees the complete message
            setTimeout(() => {
                chatMessages.scrollTo({
                    top: chatMessages.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);
        }
    }
    
    // Start typing immediately
    requestAnimationFrame(typeNextBatch);
}

// Format partial AI response for typewriter effect
function formatPartialAIResponse(fullContent, charCount) {
    const plainText = fullContent.replace(/\*\*(.*?)\*\*/g, '$1')
                                 .replace(/\*(.*?)\*/g, '$1')
                                 .replace(/`([^`]+)`/g, '$1')
                                 .replace(/```[\s\S]*?```/g, '[code block]');
    
    const partialText = plainText.substring(0, charCount);
    
    // Apply basic formatting to partial text
    let formatted = partialText
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    return `<p>${formatted}</p>`;
}

// Open image in modal (simple implementation)
function openImageModal(imageUrl) {
    window.open(imageUrl, '_blank');
}

// Format AI response (support markdown-like formatting)
function formatAIResponse(content) {
    console.log('Original AI content:', content);
    console.log('Looking for code blocks with triple backticks...');
    
    // Debug: Check if content contains triple backticks
    const hasTripleBackticks = content.includes('```');
    console.log('Has triple backticks:', hasTripleBackticks);
    
    if (hasTripleBackticks) {
        const matches = content.match(/```[\s\S]*?```/g);
        console.log('All code block matches:', matches);
    }
    
    // First, handle code blocks BEFORE basic formatting
    let formatted = content.replace(/```(\w+)?\s*([\s\S]*?)```/g, function(match, lang, code) {
        console.log('Found code block:', {match, lang, code});
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

    console.log('After code blocks processing:', formatted);

    // Then apply basic markdown formatting
    formatted = formatted
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/`([^`]+)`/g, '<code>$1</code>') // Inline code
        .replace(/\n\n/g, '</p><p>'); // Paragraphs - no line breaks conversion

    console.log('Final formatted content:', formatted);
    return `<p>${formatted}</p>`;
}

// Copy code to clipboard
function copyCodeToClipboard(codeId, button) {
    const codeElement = document.getElementById(codeId);
    if (!codeElement) return;
    
    const code = codeElement.textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        // Update button to show success
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        button.classList.add('copied');
        
        // Reset button after 2 seconds
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy code:', err);
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = code;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            button.innerHTML = '<i class="fas fa-check"></i> Copied!';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-copy"></i> Copy';
                button.classList.remove('copied');
            }, 2000);
        } catch (fallbackErr) {
            console.error('Clipboard fallback failed:', fallbackErr);
        }
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle AI response
function handleAIResponse(data) {
    console.log('Received AI response:', data);
    addMessageWithTypewriter(data.response, 'ai');
    
    // Save AI response to conversation
    if (conversations.has(currentConversationId)) {
        const conversation = conversations.get(currentConversationId);
        conversation.messages.push({
            content: data.response,
            sender: 'ai',
            timestamp: Date.now()
        });
        
        // Update lastMessageTime
        conversation.lastMessageTime = Date.now();
        conversations.set(currentConversationId, conversation);
        
        // Save to localStorage
        saveConversationsToStorage();
    }
}

// Handle typing indicator
function handleTyping(typing) {
    console.log('Typing indicator:', typing);
    isTyping = typing;
    typingIndicator.style.display = typing ? 'block' : 'none';
    
    if (typing) {
        // Auto scroll when typing starts (if user is near bottom)
        if (isUserAtBottom()) {
            scrollToBottom(true);
        }
    } else {
        // Re-enable input
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// Handle errors
function handleError(error) {
    console.error('Received error:', error);
    addMessage('Xin lỗi, đã có lỗi xảy ra: ' + error, 'ai');
    isTyping = false;
    messageInput.disabled = false;
    messageInput.focus();
}

// Scroll to bottom of chat
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Toggle sidebar
function toggleSidebar() {
    console.log('Toggle sidebar called');
    const sidebar = document.getElementById('sidebar');
    const isHidden = sidebar.classList.contains('hidden');
    const isMobile = window.innerWidth <= 768;
    
    console.log('Sidebar currently hidden:', isHidden);
    
    if (isHidden) {
        // Show sidebar
        sidebar.classList.remove('hidden');
        localStorage.setItem('sidebarHidden', 'false');
        
        // Track explicit open on mobile
        if (isMobile) {
            localStorage.setItem('sidebarExplicitlyOpened', 'true');
        }
        
        console.log('Showing sidebar');
    } else {
        // Hide sidebar
        sidebar.classList.add('hidden');
        localStorage.setItem('sidebarHidden', 'true');
        
        // Clear explicit open flag when hiding
        if (isMobile) {
            localStorage.removeItem('sidebarExplicitlyOpened');
        }
        
        console.log('Hiding sidebar');
    }
}

// Restore sidebar state from localStorage
function restoreSidebarState() {
    const sidebarHidden = localStorage.getItem('sidebarHidden');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarHidden === 'true') {
        sidebar.classList.add('hidden');
    }
}

// Show welcome screen without creating conversation
function showWelcomeScreen() {
    console.log('Showing welcome screen');
    
    // Clear any existing conversation ID since we're not creating one yet
    currentConversationId = null;
    localStorage.removeItem('currentConversationId');
    
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="logo">
                <span style="font-size: 48px;">🧠</span>
            </div>
            <h2>Chào mừng đến với <span class="brand-name">HieuBiet.Net</span></h2>
            <p>Trợ lý AI thông minh giúp bạn trả lời câu hỏi, viết code, phân tích ảnh và nhiều thứ khác!</p>
            <p><strong>✨ Đặc biệt: Tôi sẽ tự động phát hiện ngôn ngữ bạn sử dụng và trả lời bằng chính ngôn ngữ đó!</strong></p>
            <div class="example-questions">
                <h3>Ví dụ câu hỏi:</h3>
                <ul>
                    <li>🇻🇳 "Trí tuệ nhân tạo là gì?" → Trả lời bằng tiếng Việt</li>
                    <li>🇺🇸 "What is artificial intelligence?" → Answer in English</li>
                    <li>📸 Upload ảnh + "Describe this image" → Mô tả bằng tiếng Anh</li>
                    <li>💻 "Write a Python function" → Code và giải thích bằng tiếng Anh</li>
                </ul>
            </div>
        </div>
    `;
    messageInput.focus();
    
    // Update active chat in sidebar (none should be active)
    document.querySelectorAll('.chat-history-item').forEach(item => {
        item.classList.remove('active');
    });
    
    console.log('Welcome screen displayed, no conversation created yet');
}

// Start new chat
function startNewChat() {
    console.log('Starting new chat - will create conversation on first message');
    
    // Clear current conversation ID - don't generate new one yet
    currentConversationId = null;
    localStorage.removeItem('currentConversationId');
    isAutoScrolling = true;
    hasNewMessage = false;
    hideScrollToBottomButton();
    
    // Show welcome screen instead of creating conversation
    showWelcomeScreen();
    
    console.log('New chat started, conversation will be created on first message');
}

// Load chat history
function loadChatHistory() {
    // Load conversations from localStorage
    const hasData = loadConversationsFromStorage();
    
    // Clean up any invalid conversations
    cleanupInvalidConversations();
    
    if (hasData && conversations.size > 0) {
        console.log('Loaded conversations from localStorage:', conversations.size);
        // Load the current conversation if it exists
        if (conversations.has(currentConversationId)) {
            console.log('Loading current conversation:', currentConversationId);
            loadConversation(currentConversationId);
        } else {
            console.log('Current conversation not found, showing welcome screen');
            showWelcomeScreen();
        }
    } else {
        console.log('No saved conversations found, showing welcome screen');
        showWelcomeScreen();
    }
    
    updateChatHistory();
}

// Clean up invalid conversations
function cleanupInvalidConversations() {
    console.log('Cleaning up invalid conversations');
    let cleaned = 0;
    
    const toDelete = [];
    conversations.forEach((conversation, id) => {
        if (!conversation || 
            (!conversation.title && (!conversation.messages || conversation.messages.length === 0)) ||
            (conversation.title === '' && (!conversation.messages || conversation.messages.length === 0))) {
            console.log('Found invalid conversation to delete:', id, conversation);
            toDelete.push(id);
        }
    });
    
    toDelete.forEach(id => {
        conversations.delete(id);
        cleaned++;
    });
    
    if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} invalid conversations`);
        saveConversationsToStorage();
        updateChatHistory();
    }
    
    return cleaned;
}

// Clear all chat history
function clearAllHistory() {
    console.log('clearAllHistory called');
    console.log('Current conversations:', conversations);
    
    // Confirm deletion
    if (confirm('Bạn có chắc chắn muốn xóa TẤT CẢ lịch sử chat? Hành động này không thể hoàn tác!')) {
        console.log('User confirmed, clearing all history');
        
        // Clear all conversations
        conversations.clear();
        console.log('Conversations cleared from memory');
        
        // Clear localStorage
        localStorage.removeItem('chatConversations');
        localStorage.removeItem('currentConversationId');
        console.log('LocalStorage cleared');
        
        // Start a new chat
        startNewChat();
        console.log('New chat started');
        
        console.log('All chat history cleared successfully');
    } else {
        console.log('Clear all cancelled by user');
    }
}

// Delete conversation
function deleteConversation(conversationId, event) {
    // Prevent triggering loadConversation when clicking delete
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    console.log('Deleting conversation:', conversationId);
    console.log('Current conversations:', conversations);
    
    // Confirm deletion
    if (confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) {
        // Remove from conversations map
        const wasDeleted = conversations.delete(conversationId);
        console.log('Conversation deleted from map:', wasDeleted);
        
        // Save to localStorage
        saveConversationsToStorage();
        console.log('Saved to localStorage');
        
        // If this was the current conversation, start a new one
        if (conversationId === currentConversationId) {
            console.log('Deleted current conversation, starting new chat');
            startNewChat();
        }
        
        // Update sidebar
        updateChatHistory();
        console.log('Updated chat history');
        
        console.log('Conversation deleted successfully');
    } else {
        console.log('Deletion cancelled by user');
    }
}

// Update chat history display
function updateChatHistory() {
    console.log('Updating chat history, conversations count:', conversations.size);
    chatHistoryList.innerHTML = '';
    
    if (conversations.size === 0) {
        console.log('No conversations to display');
        return;
    }
    
    // Convert to array and sort by lastMessageTime (newest first)
    const conversationsArray = Array.from(conversations.entries()).sort((a, b) => {
        const timeA = a[1].lastMessageTime || 0;
        const timeB = b[1].lastMessageTime || 0;
        return timeB - timeA; // Newest first
    });
    
    conversationsArray.forEach(([id, conversation]) => {
        // Skip invalid conversations
        if (!conversation || (!conversation.title && !conversation.messages) || 
            (conversation.title === '' && (!conversation.messages || conversation.messages.length === 0))) {
            console.log('Skipping invalid conversation:', id, conversation);
            // Remove invalid conversation
            conversations.delete(id);
            saveConversationsToStorage();
            return;
        }
        
        console.log('Creating history item for:', id, conversation.title);
        
        const historyItem = document.createElement('div');
        historyItem.className = 'chat-history-item';
        historyItem.setAttribute('data-conversation-id', id);
        
        if (id === currentConversationId) {
            historyItem.classList.add('active');
        }
        
        // Create text span - use default title if empty
        const textSpan = document.createElement('span');
        textSpan.className = 'chat-history-item-text';
        const displayTitle = conversation.title || `Chat ${new Date().toLocaleDateString('vi-VN')}`;
        textSpan.textContent = displayTitle;
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'chat-history-item-delete';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Xóa cuộc trò chuyện';
        
        console.log('Created delete button for:', id);
        
        // Add event listeners
        textSpan.addEventListener('click', () => {
            console.log('Clicking on conversation:', id);
            loadConversation(id);
        });
        
        deleteBtn.addEventListener('click', (event) => {
            console.log('Delete button clicked for:', id);
            deleteConversation(id, event);
        });
        
        historyItem.appendChild(textSpan);
        historyItem.appendChild(deleteBtn);
        chatHistoryList.appendChild(historyItem);
        
        console.log('Added history item to DOM');
    });
}

// Load conversation
function loadConversation(conversationId) {
    console.log('Loading conversation:', conversationId);
    currentConversationId = conversationId;
    
    // Save current conversation ID to localStorage
    localStorage.setItem('currentConversationId', conversationId);
    
    const conversation = conversations.get(conversationId);
    console.log('Found conversation:', conversation);
    
    if (conversation) {
        chatMessages.innerHTML = '';
        
        // Load conversation messages with proper structure
        if (conversation.messages && conversation.messages.length > 0) {
            console.log('Loading', conversation.messages.length, 'messages');
            conversation.messages.forEach((msg, index) => {
                console.log('Loading message', index + 1, ':', msg);
                const messageDiv = createMessageElement(
                    msg.content, 
                    msg.sender === 'user' ? 'user' : 'ai', 
                    msg.imageUrl
                );
                chatMessages.appendChild(messageDiv);
            });
        } else {
            console.log('No messages found in conversation');
        }
        
        // Scroll to bottom
        setTimeout(() => {
            scrollToBottom();
        }, 100);
        
        // Update active chat in sidebar
        document.querySelectorAll('.chat-history-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find and highlight the active item
        const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            console.log('Highlighted active conversation in sidebar');
        }
    } else {
        console.log('Conversation not found!');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Load conversations and sidebar state from localStorage
    loadConversationsFromStorage();
    restoreSidebarState();
    
    // Load chat history and restore current conversation
    loadChatHistory();
    
    // Focus on input
    messageInput.focus();
});

// Handle window resize for mobile
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        // On desktop, restore sidebar state from localStorage
        restoreSidebarState();
    }
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        !sidebar.classList.contains('hidden') && 
        !sidebar.contains(e.target) && 
        !e.target.closest('.sidebar-toggle')) {
        sidebar.classList.add('hidden');
        localStorage.setItem('sidebarHidden', 'true');
    }
});
