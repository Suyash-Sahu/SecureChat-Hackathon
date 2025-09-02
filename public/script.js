// Global variables
let socket;
let currentUser = '';
let messageHistory = [];
let selectedFile = null;

// DOM elements
const loginSection = document.getElementById('loginSection');
const chatSection = document.getElementById('chatSection');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const loginError = document.getElementById('loginError');
const currentUserSpan = document.getElementById('currentUser');
const userCountSpan = document.getElementById('userCount');
const userListDiv = document.getElementById('userList');
const chatMessagesDiv = document.getElementById('chatMessages');
const recipientSelect = document.getElementById('recipientSelect');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const logoutBtn = document.getElementById('logoutBtn');
const fileInput = document.getElementById('fileInput');
const attachBtn = document.getElementById('attachBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInfo = document.getElementById('fileInfo');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Connect to Socket.IO server
    socket = io();
    
    // Set up event listeners
    setupEventListeners();
    setupSocketListeners();
    
    // Focus on username input
    usernameInput.focus();
});

// Set up DOM event listeners
function setupEventListeners() {
    // Enter key in username input
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinChat();
        }
    });
    
    // Enter key in message input
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Logout button
    logoutBtn.addEventListener('click', logout);
}

// Set up Socket.IO event listeners
function setupSocketListeners() {
    // Connection established
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    // Login success
    socket.on('loginSuccess', (data) => {
        currentUser = data.username;
        currentUserSpan.textContent = currentUser;
        updateUserList(data.users);
        showChatSection();
        clearLoginError();
    });
    
    // Login error
    socket.on('loginError', (message) => {
        showLoginError(message);
    });
    
    // New message received
    socket.on('newMessage', (message) => {
        addMessageToChat(message, 'received');
        messageHistory.push(message);
    });
    
    // Message sent confirmation
    socket.on('messageSent', (message) => {
        addMessageToChat(message, 'sent');
        messageHistory.push(message);
    });
    
    // Message error
    socket.on('messageError', (error) => {
        showMessageError(error);
    });
    
    // User list update
    socket.on('userList', (users) => {
        updateUserList(users);
    });
    
    // User joined
    socket.on('userJoined', (username) => {
        addSystemMessage(`${username} joined the chat`);
        updateUserList([...Array.from(userListDiv.children).map(item => item.textContent), username]);
    });
    
    // User left
    socket.on('userLeft', (username) => {
        addSystemMessage(`${username} left the chat`);
        updateUserList(Array.from(userListDiv.children).map(item => item.textContent).filter(user => user !== username));
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        addSystemMessage('Disconnected from server');
    });
}

// Join chat function
function joinChat() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        showLoginError('Please enter a username');
        return;
    }
    
    if (username.length < 2) {
        showLoginError('Username must be at least 2 characters long');
        return;
    }
    
    // Disable join button and show loading state
    joinBtn.disabled = true;
    joinBtn.textContent = 'Joining...';
    
    // Emit login event
    socket.emit('userLogin', username);
}

// Send message function
function sendMessage() {
    const message = messageInput.value.trim();
    const recipient = recipientSelect.value;
    
    if (!message) {
        return;
    }
    
    if (!recipient) {
        showMessageError('Please select a recipient');
        return;
    }
    
    if (recipient === currentUser) {
        showMessageError('You cannot send a message to yourself');
        return;
    }
    
    // Emit private message event
    socket.emit('privateMessage', {
        to: recipient,
        message: message
    });
    
    // Clear message input
    messageInput.value = '';
}

// Logout function
function logout() {
    if (socket) {
        socket.emit('logout');
    }
    
    // Reset state
    currentUser = '';
    messageHistory = [];
    
    // Clear UI
    clearChat();
    clearUserList();
    
    // Show login section
    showLoginSection();
    
    // Reset join button
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Chat';
    
    // Focus on username input
    usernameInput.focus();
}

// Show chat section
function showChatSection() {
    loginSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
}

// Show login section
function showLoginSection() {
    chatSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
}

// Update user list
function updateUserList(users) {
    userListDiv.innerHTML = '';
    userCountSpan.textContent = users.length;
    
    users.forEach(username => {
        if (username !== currentUser) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.textContent = username;
            userListDiv.appendChild(userItem);
            
            // Add to recipient select
            if (!Array.from(recipientSelect.options).some(option => option.value === username)) {
                const option = document.createElement('option');
                option.value = username;
                option.textContent = username;
                recipientSelect.appendChild(option);
            }
        }
    });
}

// Add message to chat
function addMessageToChat(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // Add file-message class if it's a file message
    if (message.file) {
        messageDiv.classList.add('file-message');
    }
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'message-header';
    headerDiv.textContent = `${message.from} → ${message.to} • ${formatTime(message.timestamp)}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message.message;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    // Add file preview/download if it's a file message
    if (message.file) {
        const fileElement = createFileElement(message.file);
        messageDiv.appendChild(fileElement);
    }
    
    chatMessagesDiv.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Create file element (preview or download link)
function createFileElement(file) {
    const fileContainer = document.createElement('div');
    fileContainer.className = 'file-preview';
    
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        // Image preview
        const img = document.createElement('img');
        img.src = file.url;
        img.alt = file.originalName;
        img.onerror = () => {
            img.style.display = 'none';
            const downloadLink = createDownloadLink(file);
            fileContainer.appendChild(downloadLink);
        };
        fileContainer.appendChild(img);
    } else {
        // Download link for non-images
        const downloadLink = createDownloadLink(file);
        fileContainer.appendChild(downloadLink);
    }
    
    // File metadata
    const metaDiv = document.createElement('div');
    metaDiv.className = 'file-meta';
    metaDiv.textContent = `${file.originalName} • ${formatFileSize(file.size)}`;
    fileContainer.appendChild(metaDiv);
    
    return fileContainer;
}

// Create download link
function createDownloadLink(file) {
    const link = document.createElement('a');
    link.href = file.url;
    link.className = 'file-download';
    link.download = file.originalName;
    link.target = '_blank';
    link.textContent = `📥 Download ${file.originalName}`;
    return link;
}

// Add system message
function addSystemMessage(message) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'message system';
    systemDiv.style.textAlign = 'center';
    systemDiv.style.color = '#666';
    systemDiv.style.fontStyle = 'italic';
    systemDiv.textContent = message;
    
    chatMessagesDiv.appendChild(systemDiv);
    
    // Scroll to bottom
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Show login error
function showLoginError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    
    // Re-enable join button
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Chat';
}

// Clear login error
function clearLoginError() {
    loginError.textContent = '';
    loginError.style.display = 'none';
}

// Show message error
function showMessageError(message) {
    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message system';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.color = '#e74c3c';
    errorDiv.style.fontStyle = 'italic';
    errorDiv.textContent = `Error: ${message}`;
    
    chatMessagesDiv.appendChild(errorDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 3000);
    
    // Scroll to bottom
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Clear chat
function clearChat() {
    chatMessagesDiv.innerHTML = '';
}

// Clear user list
function clearUserList() {
    userListDiv.innerHTML = '';
    userCountSpan.textContent = '0';
    
    // Clear recipient select except first option
    recipientSelect.innerHTML = '<option value="">Select recipient...</option>';
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        // Validate file size (25MB limit)
        if (file.size > 25 * 1024 * 1024) {
            showMessageError('File too large. Maximum size is 25MB.');
            fileInput.value = '';
            return;
        }
        
        // Validate file type
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'
        ];
        
        if (!allowedTypes.includes(file.type)) {
            showMessageError('Invalid file type. Only images, PDFs, documents, and text files are allowed.');
            fileInput.value = '';
            return;
        }
        
        selectedFile = file;
        fileInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        attachBtn.textContent = '📎 Change File';
        attachBtn.style.background = '#ffc107';
        attachBtn.style.color = '#000';
        uploadBtn.style.display = 'inline-block';
    }
}

// Upload file and send message
async function uploadAndSendFile() {
    console.log('🚀 === FILE UPLOAD START ===');
    
    if (!selectedFile) {
        console.log('❌ No file selected');
        showMessageError('No file selected');
        return;
    }
    
    const recipient = recipientSelect.value;
    if (!recipient) {
        console.log('❌ No recipient selected');
        showMessageError('Please select a recipient');
        return;
    }
    
    if (recipient === currentUser) {
        console.log('❌ Cannot send to self');
        showMessageError('You cannot send a file to yourself');
        return;
    }
    
    console.log('📁 File upload details:', {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type,
        recipient: recipient,
        timestamp: new Date().toISOString()
    });
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    // Log FormData contents
    console.log('📦 FormData created with file:', selectedFile.name);
    
    try {
        // Show uploading state
        attachBtn.textContent = '📤 Uploading...';
        attachBtn.disabled = true;
        
        console.log('🌐 Sending upload request to /upload...');
        console.log('🔍 Request details:', {
            method: 'POST',
            url: '/upload',
            fileField: 'file',
            fileName: selectedFile.name
        });
        
        // Upload file
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        console.log('📡 Upload response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Upload failed with status:', response.status);
            console.error('❌ Error response body:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Upload result received:', result);
        
        if (result.success) {
            console.log('🎉 Upload successful, sending file message via Socket.IO...');
            
            // Send file message via Socket.IO
            const socketData = {
                to: recipient,
                message: `📎 File: ${selectedFile.name}`,
                file: result.file
            };
            
            console.log('📤 Socket.IO data:', socketData);
            socket.emit('privateMessage', socketData);
            
            console.log('✅ File message sent via Socket.IO');
            
            // Reset file selection
            resetFileSelection();
            
        } else {
            console.log('❌ Upload response indicates failure:', result);
            showMessageError(result.error || 'Upload failed');
        }
        
    } catch (error) {
        console.error('💥 CRITICAL UPLOAD ERROR:', error);
        console.error('💥 Error name:', error.name);
        console.error('💥 Error message:', error.message);
        console.error('💥 Error stack:', error.stack);
        showMessageError('Upload failed: ' + error.message);
    } finally {
        // Reset button state
        attachBtn.textContent = '📎 Attach File';
        attachBtn.disabled = false;
        attachBtn.style.background = '#28a745';
        attachBtn.style.color = '#fff';
        console.log('🔄 Button state reset');
    }
    
    console.log('🏁 === FILE UPLOAD END ===');
}

// Reset file selection
function resetFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.textContent = '';
    attachBtn.textContent = '📎 Attach File';
    attachBtn.style.background = '#28a745';
    attachBtn.style.color = '#fff';
    uploadBtn.style.display = 'none';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format timestamp
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
