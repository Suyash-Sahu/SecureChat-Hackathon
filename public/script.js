// Global variables
let socket;
let currentUser = '';
let messageHistory = [];
let selectedFile = null;
let contacts = [];
let onlineUsers = [];
let accessToken = '';
let refreshToken = '';
let isReconnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Contact management variables
let friendRequests = { incoming: [], outgoing: [] };
let selectedUserId = null;

// DOM elements
const authSection = document.getElementById('authSection');
const chatSection = document.getElementById('chatSection');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const otpForm = document.getElementById('otpForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const authError = document.getElementById('authError');
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

// Utility functions for error handling
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function getCsrfTokenFromCookie() {
    const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

function withAuthDefaults(options = {}) {
    const headers = new Headers(options.headers || {});
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const csrf = getCsrfTokenFromCookie();
        if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    // Default JSON content-type if body is plain object
    const body = options.body;
    const isFormData = (typeof FormData !== 'undefined') && body instanceof FormData;
    if (body && !isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    return {
        ...options,
        headers,
        credentials: 'include'
    };
}

function fetchWithTimeout(url, options, timeout = 10000) {
    const finalOptions = withAuthDefaults(options);
    return Promise.race([
        fetch(url, finalOptions),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TimeoutError')), timeout)
        )
    ]);
}

function getErrorMessage(status, errorData) {
    const statusMessages = {
        400: 'Invalid request. Please check your input.',
        401: 'Invalid credentials. Please try again.',
        403: 'Access denied. Please log in again.',
        404: 'Service not found. Please try again later.',
        409: 'Account already exists. Please try logging in instead.',
        422: 'Invalid data provided. Please check your input.',
        429: 'Too many requests. Please wait a moment and try again.',
        500: 'Server error. Please try again later.',
        502: 'Service temporarily unavailable. Please try again later.',
        503: 'Service temporarily unavailable. Please try again later.'
    };
    
    if (errorData && errorData.message) {
        return errorData.message;
    }
    
    return statusMessages[status] || `Request failed with status ${status}`;
}

function logError(context, error, additionalData = {}) {
    console.error(`[${context}] Error:`, {
        message: error.message,
        stack: error.stack,
        ...additionalData,
        timestamp: new Date().toISOString()
    });
}

function showConnectionStatus(message, type = 'info') {
    const statusDiv = document.createElement('div');
    statusDiv.className = `connection-status ${type}`;
    statusDiv.textContent = message;
    statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 15px;
        border-radius: 5px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    if (type === 'error') {
        statusDiv.style.backgroundColor = '#e74c3c';
    } else if (type === 'warning') {
        statusDiv.style.backgroundColor = '#f39c12';
    } else if (type === 'success') {
        statusDiv.style.backgroundColor = '#27ae60';
    } else {
        statusDiv.style.backgroundColor = '#3498db';
    }
    
    document.body.appendChild(statusDiv);
    
    setTimeout(() => {
        if (statusDiv.parentNode) {
            statusDiv.parentNode.removeChild(statusDiv);
        }
    }, 5000);
}

// Global error handler
window.addEventListener('error', function(event) {
    logError('Global Error', event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

window.addEventListener('unhandledrejection', function(event) {
    logError('Unhandled Promise Rejection', event.reason);
    event.preventDefault(); // Prevent the default browser behavior
});

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Check if user is already logged in
        const savedToken = localStorage.getItem('accessToken');
        if (savedToken) {
            accessToken = savedToken;
            refreshToken = localStorage.getItem('refreshToken') || '';
            // Verify token and get current user
            verifyTokenAndConnect();
        } else {
            // Show login form
            showLogin();
        }
        
        // Set up event listeners
        setupEventListeners();
    } catch (error) {
        logError('App Initialization', error);
        showLogin();
    }
});

// Set up DOM event listeners
function setupEventListeners() {
    // Enter key in login form
    document.getElementById('loginEmail').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('loginPassword').focus();
        }
    });
    
    document.getElementById('loginPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            login();
        }
    });
    
    // Enter key in register form
    document.getElementById('registerUsername').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('registerEmail').focus();
        }
    });
    
    document.getElementById('registerEmail').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('registerPassword').focus();
        }
    });
    
    document.getElementById('registerPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            register();
        }
    });
    
    // Enter key in OTP form
    document.getElementById('otpInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            verifyOtp();
        }
    });
    
    // Enter key in forgot password form
    document.getElementById('forgotEmail').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            forgotPassword();
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
    
    // Contact management
    setupContactEventListeners();
}

// Contact Management Functions
function setupContactEventListeners() {
    // Tab switching
    document.getElementById('onlineUsersTab').addEventListener('click', () => switchTab('onlineUsers'));
    document.getElementById('contactsTab').addEventListener('click', () => switchTab('contacts'));
    document.getElementById('requestsTab').addEventListener('click', () => switchTab('requests'));
    
    // Contact management buttons
    document.getElementById('addContactBtn').addEventListener('click', showContactModal);
    document.getElementById('closeContactModal').addEventListener('click', hideContactModal);
    document.getElementById('searchUsersBtn').addEventListener('click', searchUsers);
    document.getElementById('userSearchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchUsers();
        }
    });
    
    // Request tabs
    document.getElementById('incomingRequestsTab').addEventListener('click', () => switchRequestTab('incoming'));
    document.getElementById('outgoingRequestsTab').addEventListener('click', () => switchRequestTab('outgoing'));
    
    // Modal close buttons
    document.getElementById('closeUserActionsModal').addEventListener('click', hideUserActionsModal);
    document.getElementById('closeReportModal').addEventListener('click', hideReportModal);
    document.getElementById('cancelReportBtn').addEventListener('click', hideReportModal);
    document.getElementById('submitReportBtn').addEventListener('click', submitReport);
    
    // Click outside modal to close
    document.getElementById('contactModal').addEventListener('click', function(e) {
        if (e.target === this) hideContactModal();
    });
    document.getElementById('userActionsModal').addEventListener('click', function(e) {
        if (e.target === this) hideUserActionsModal();
    });
    document.getElementById('reportModal').addEventListener('click', function(e) {
        if (e.target === this) hideReportModal();
    });
}

// Tab switching
function switchTab(tabName) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab panel
    document.getElementById(tabName + 'Content').classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Load data for the selected tab
    if (tabName === 'contacts') {
        loadContacts();
    } else if (tabName === 'requests') {
        loadFriendRequests();
    }
}

// Request tab switching
function switchRequestTab(type) {
    document.querySelectorAll('.request-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.requests-list ul').forEach(list => {
        list.classList.add('hidden');
    });
    
    document.getElementById(type + 'RequestsTab').classList.add('active');
    document.getElementById(type + 'RequestsList').classList.remove('hidden');
}

// Load contacts
async function loadContacts() {
    try {
        const response = await fetchWithTimeout('/api/v1/contacts/list', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Failed to load contacts: ${response.status}`);
        }
        
        const data = await response.json();
        contacts = data.data.contacts || [];
        displayContacts();
        
    } catch (error) {
        logError('Load Contacts', error);
        showConnectionStatus('Failed to load contacts', 'error');
    }
}

// Display contacts
function displayContacts() {
    const contactsList = document.getElementById('contactsList');
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<li class="no-contacts">No contacts yet. Add some friends!</li>';
        return;
    }
    
    contacts.forEach(contact => {
        const li = document.createElement('li');
        li.className = 'contact-item';
        li.innerHTML = `
            <div class="contact-info">
                <div class="contact-avatar">${contact.username.charAt(0).toUpperCase()}</div>
                <div class="contact-details">
                    <h4>${contact.username}</h4>
                    <p>${contact.email}</p>
                </div>
            </div>
            <div class="contact-actions">
                <button class="action-btn primary" onclick="selectRecipient('${contact.username}')">Chat</button>
                <button class="action-btn danger" onclick="showUserActions('${contact.contactId}', '${contact.username}')">⋯</button>
            </div>
        `;
        contactsList.appendChild(li);
    });
}

// Load friend requests
async function loadFriendRequests() {
    try {
        const [incomingResponse, outgoingResponse] = await Promise.all([
            fetchWithTimeout('/api/v1/contacts/requests?type=incoming', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }, 10000),
            fetchWithTimeout('/api/v1/contacts/requests?type=outgoing', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }, 10000)
        ]);
        
        if (incomingResponse.ok) {
            const incomingData = await incomingResponse.json();
            friendRequests.incoming = incomingData.data.requests || [];
        }
        
        if (outgoingResponse.ok) {
            const outgoingData = await outgoingResponse.json();
            friendRequests.outgoing = outgoingData.data.requests || [];
        }
        
        displayFriendRequests();
        
    } catch (error) {
        logError('Load Friend Requests', error);
        showConnectionStatus('Failed to load friend requests', 'error');
    }
}

// Display friend requests
function displayFriendRequests() {
    displayIncomingRequests();
    displayOutgoingRequests();
}

function displayIncomingRequests() {
    const list = document.getElementById('incomingRequestsList');
    list.innerHTML = '';
    
    if (friendRequests.incoming.length === 0) {
        list.innerHTML = '<li class="no-requests">No incoming requests</li>';
        return;
    }
    
    friendRequests.incoming.forEach(request => {
        const li = document.createElement('li');
        li.className = 'request-item';
        li.innerHTML = `
            <div class="request-header">
                <div class="request-user">
                    <div class="request-avatar">${request.fromUser.username.charAt(0).toUpperCase()}</div>
                    <div class="request-details">
                        <h4>${request.fromUser.username}</h4>
                        <p>${request.fromUser.email}</p>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="request-btn accept" onclick="acceptFriendRequest('${request.id}')">Accept</button>
                    <button class="request-btn reject" onclick="rejectFriendRequest('${request.id}')">Reject</button>
                </div>
            </div>
            <div class="request-time">${new Date(request.createdAt).toLocaleString()}</div>
        `;
        list.appendChild(li);
    });
}

function displayOutgoingRequests() {
    const list = document.getElementById('outgoingRequestsList');
    list.innerHTML = '';
    
    if (friendRequests.outgoing.length === 0) {
        list.innerHTML = '<li class="no-requests">No outgoing requests</li>';
        return;
    }
    
    friendRequests.outgoing.forEach(request => {
        const li = document.createElement('li');
        li.className = 'request-item';
        li.innerHTML = `
            <div class="request-header">
                <div class="request-user">
                    <div class="request-avatar">${request.toUser.username.charAt(0).toUpperCase()}</div>
                    <div class="request-details">
                        <h4>${request.toUser.username}</h4>
                        <p>${request.toUser.email}</p>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="request-btn cancel" onclick="cancelFriendRequest('${request.id}')">Cancel</button>
                </div>
            </div>
            <div class="request-time">${new Date(request.createdAt).toLocaleString()}</div>
        `;
        list.appendChild(li);
    });
}

// Show contact modal
function showContactModal() {
    document.getElementById('contactModal').classList.remove('hidden');
    document.getElementById('userSearchInput').focus();
}

// Hide contact modal
function hideContactModal() {
    document.getElementById('contactModal').classList.add('hidden');
    document.getElementById('userSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

// Search users
async function searchUsers() {
    const query = document.getElementById('userSearchInput').value.trim();
    
    if (!query || query.length < 2) {
        showConnectionStatus('Please enter at least 2 characters to search', 'warning');
        return;
    }
    
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/search?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const data = await response.json();
        displaySearchResults(data.data.users || []);
        
    } catch (error) {
        logError('Search Users', error);
        showConnectionStatus('Search failed. Please try again.', 'error');
    }
}

// Display search results
function displaySearchResults(users) {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '';
    
    if (users.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No users found</div>';
        return;
    }
    
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        
        let actionButton = '';
        if (user.relationship === 'contact') {
            actionButton = '<button class="search-result-btn secondary" disabled>Already Friends</button>';
        } else if (user.relationship === 'pending' && user.relationship.isOutgoing) {
            actionButton = '<button class="search-result-btn secondary" disabled>Request Sent</button>';
        } else if (user.relationship === 'pending' && !user.relationship.isOutgoing) {
            actionButton = '<button class="search-result-btn primary" onclick="acceptFriendRequestFromSearch(\'' + user.id + '\')">Accept Request</button>';
        } else {
            actionButton = '<button class="search-result-btn primary" onclick="sendFriendRequest(\'' + user.id + '\')">Add Friend</button>';
        }
        
        div.innerHTML = `
            <div class="search-result-info">
                <div class="search-result-avatar">${user.username.charAt(0).toUpperCase()}</div>
                <div class="search-result-details">
                    <h4>${user.username}</h4>
                    <p>${user.email}</p>
                </div>
            </div>
            <div class="search-result-actions">
                ${actionButton}
                <button class="search-result-btn secondary" onclick="showUserActions('${user.id}', '${user.username}')">Actions</button>
            </div>
        `;
        resultsContainer.appendChild(div);
    });
}

// Send friend request
async function sendFriendRequest(userId) {
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/request/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }, 10000);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Request failed: ${response.status}`);
        }
        
        showConnectionStatus('Friend request sent!', 'success');
        searchUsers(); // Refresh search results
        
    } catch (error) {
        logError('Send Friend Request', error);
        showConnectionStatus(error.message || 'Failed to send friend request', 'error');
    }
}

// Accept friend request
async function acceptFriendRequest(requestId) {
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/request/${requestId}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Accept failed: ${response.status}`);
        }
        
        showConnectionStatus('Friend request accepted!', 'success');
        loadFriendRequests(); // Refresh requests
        loadContacts(); // Refresh contacts
        rebuildRecipientOptions(); // Update recipient dropdown
        
    } catch (error) {
        logError('Accept Friend Request', error);
        showConnectionStatus('Failed to accept friend request', 'error');
    }
}

// Reject friend request
async function rejectFriendRequest(requestId) {
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/request/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Reject failed: ${response.status}`);
        }
        
        showConnectionStatus('Friend request rejected', 'success');
        loadFriendRequests(); // Refresh requests
        
    } catch (error) {
        logError('Reject Friend Request', error);
        showConnectionStatus('Failed to reject friend request', 'error');
    }
}

// Cancel friend request
async function cancelFriendRequest(requestId) {
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/request/${requestId}/cancel`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Cancel failed: ${response.status}`);
        }
        
        showConnectionStatus('Friend request cancelled', 'success');
        loadFriendRequests(); // Refresh requests
        
    } catch (error) {
        logError('Cancel Friend Request', error);
        showConnectionStatus('Failed to cancel friend request', 'error');
    }
}

// Show user actions modal
function showUserActions(userId, username) {
    selectedUserId = userId;
    document.getElementById('userActionsTitle').textContent = `Actions for ${username}`;
    
    const actionsList = document.createElement('ul');
    actionsList.className = 'user-actions-list';
    actionsList.innerHTML = `
        <li onclick="removeContact('${userId}')">Remove from Contacts</li>
        <li onclick="blockUser('${userId}')">Block User</li>
        <li onclick="showReportModal('${userId}', '${username}')" class="danger">Report User</li>
    `;
    
    document.getElementById('userActionsContent').innerHTML = '';
    document.getElementById('userActionsContent').appendChild(actionsList);
    document.getElementById('userActionsModal').classList.remove('hidden');
}

// Hide user actions modal
function hideUserActionsModal() {
    document.getElementById('userActionsModal').classList.add('hidden');
    selectedUserId = null;
}

// Remove contact
async function removeContact(contactId) {
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/${contactId}/remove`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Remove failed: ${response.status}`);
        }
        
        showConnectionStatus('Contact removed', 'success');
        hideUserActionsModal();
        loadContacts(); // Refresh contacts
        rebuildRecipientOptions(); // Update recipient dropdown
        
    } catch (error) {
        logError('Remove Contact', error);
        showConnectionStatus('Failed to remove contact', 'error');
    }
}

// Block user
async function blockUser(userId) {
    if (!confirm('Are you sure you want to block this user? This will remove them from your contacts and prevent future communication.')) {
        return;
    }
    
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/${userId}/block`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: 'User blocked via contact management' })
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Block failed: ${response.status}`);
        }
        
        showConnectionStatus('User blocked successfully', 'success');
        hideUserActionsModal();
        loadContacts(); // Refresh contacts
        rebuildRecipientOptions(); // Update recipient dropdown
        
    } catch (error) {
        logError('Block User', error);
        showConnectionStatus('Failed to block user', 'error');
    }
}

// Show report modal
function showReportModal(userId, username) {
    selectedUserId = userId;
    document.getElementById('reportReason').value = '';
    document.getElementById('reportModal').classList.remove('hidden');
    hideUserActionsModal();
}

// Hide report modal
function hideReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
    selectedUserId = null;
}

// Submit report
async function submitReport() {
    const reason = document.getElementById('reportReason').value.trim();
    
    if (!reason || reason.length < 10) {
        showConnectionStatus('Please provide a detailed reason (at least 10 characters)', 'warning');
        return;
    }
    
    try {
        const response = await fetchWithTimeout(`/api/v1/contacts/${selectedUserId}/report`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        }, 10000);
        
        if (!response.ok) {
            throw new Error(`Report failed: ${response.status}`);
        }
        
        showConnectionStatus('User reported successfully', 'success');
        hideReportModal();
        
    } catch (error) {
        logError('Submit Report', error);
        showConnectionStatus('Failed to submit report', 'error');
    }
}

// Select recipient for chat
function selectRecipient(username) {
    const recipientSelect = document.getElementById('recipientSelect');
    recipientSelect.value = username;
    showConnectionStatus(`Selected ${username} for chat`, 'success');
}

// Authentication functions
async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // Enhanced validation
    if (!email || !password) {
        showAuthError('Please fill in all fields');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters long');
        return;
    }
    
    const loginBtn = document.getElementById('loginBtn');
    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        }, 10000); // 10 second timeout
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = getErrorMessage(response.status, errorData);
            showAuthError(errorMessage);
            return;
        }
        
        const data = await response.json();
        
        if (data.success === false || !data.data) {
            showAuthError(data.message || 'Login failed - invalid response');
            return;
        }
        
        // Validate response structure
        if (!data.data || !data.data.user) {
            showAuthError('Invalid response from server');
            return;
        }
        
        accessToken = '';
        refreshToken = '';
        currentUser = data.data.user.username;
        
        // Save tokens to localStorage with error handling
        // Cookies are set by server; no localStorage persistence required
        
        // Connect to chat
        connectToChat();
        
    } catch (error) {
        console.error('Login error:', error);
        if (error.name === 'TimeoutError') {
            showAuthError('Login timed out. Please check your connection and try again.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showAuthError('Cannot connect to server. Please check your internet connection.');
        } else {
            showAuthError('An unexpected error occurred. Please try again.');
        }
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    // Enhanced validation
    if (!username || !email || !password) {
        showAuthError('Please fill in all fields');
        return;
    }
    
    if (username.length < 3) {
        showAuthError('Username must be at least 3 characters long');
        return;
    }
    
    if (username.length > 20) {
        showAuthError('Username must be less than 20 characters');
        return;
    }
    
    if (!/^[a-z0-9_]+$/.test(username)) {
        showAuthError('Username can only contain lowercase letters, numbers, and underscores');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters long');
        return;
    }
    
    if (password.length > 128) {
        showAuthError('Password must be less than 128 characters');
        return;
    }
    
    const registerBtn = document.getElementById('registerBtn');
    const originalText = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Registering...';
    
    // Clear any previous errors
    clearAuthError();
    
    // Show a temporary processing message
    const processingMessage = document.createElement('div');
    processingMessage.className = 'alert alert-info';
    processingMessage.innerHTML = '<i class="bi bi-info-circle me-2"></i>Creating your account, please wait...';
    authError.appendChild(processingMessage);
    
    // Set a flag to track if we've shown success
    let hasShownSuccess = false;
    
    // Set a timeout to show success after 5 seconds if the request is still pending
    const successTimeout = setTimeout(() => {
        if (!hasShownSuccess) {
            processingMessage.innerHTML = '<i class="bi bi-check-circle me-2"></i>Almost done! Processing your registration...';
            processingMessage.className = 'alert alert-info';
        }
    }, 5000);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch('/api/v1/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfTokenFromCookie()
            },
            body: JSON.stringify({ 
                username, 
                email, 
                password
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = getErrorMessage(response.status, errorData);
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            throw new Error(data.message || 'Registration failed');
        }
        
        // Store registration data for OTP verification
        window.registrationData = { username, email };
        
        // Mark success
        hasShownSuccess = true;
        
        // Show success message
        showAuthError('Registration successful! Please check your email for the verification code.', 'success');
        
        // Show OTP form after a short delay
        setTimeout(() => {
            showOtpForm();
        }, 1000);
        
    } catch (error) {
        logError('Registration', error, { username, email });
        
        // Remove processing message
        if (processingMessage.parentNode === authError) {
            authError.removeChild(processingMessage);
        }
        
        // Show appropriate error message
        if (error.name === 'AbortError' || error.message === 'TimeoutError') {
            // The request took too long, but it might have succeeded on the server
            showAuthError('Registration is taking longer than expected. Please check your email for a verification link.', 'info');
            
            // Store the email for OTP verification in case the request actually succeeded
            window.registrationData = { username, email };
            
            // Show OTP form after a delay
            setTimeout(() => {
                showOtpForm();
            }, 1000);
        } else {
            showAuthError(error.message || 'An error occurred during registration. Please try again.');
        }
    } finally {
        // Clean up
        clearTimeout(successTimeout);
        registerBtn.disabled = false;
        registerBtn.innerHTML = originalText;
        
        // Remove processing message after a delay if it's still there
        setTimeout(() => {
            if (processingMessage.parentNode === authError) {
                authError.removeChild(processingMessage);
            }
        }, 5000);
    }
}

// OTP Verification Functions
async function verifyOtp() {
    const otp = document.getElementById('otpInput').value.trim();
    
    if (!otp || otp.length !== 6) {
        showAuthError('Please enter a valid 6-digit code');
        return;
    }
    
    if (!/^\d{6}$/.test(otp)) {
        showAuthError('OTP must contain only numbers');
        return;
    }
    
    if (!window.registrationData) {
        showAuthError('Registration data not found. Please register again.');
        showRegister();
        return;
    }
    
    const verifyBtn = document.getElementById('verifyOtpBtn');
    const originalText = verifyBtn.textContent;
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/verify-email-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: window.registrationData.email,
                otp: otp
            })
        }, 10000);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = getErrorMessage(response.status, errorData);
            showAuthError(errorMessage);
            return;
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            showAuthError(data.message || 'OTP verification failed');
            return;
        }
        
        // Clear registration data
        window.registrationData = null;
        
        showAuthError('Email verified successfully! You can now log in.', 'success');
        showLogin();
        
    } catch (error) {
        logError('OTP Verification', error);
        if (error.name === 'TimeoutError') {
            showAuthError('Verification timed out. Please try again.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showAuthError('Cannot connect to server. Please check your internet connection.');
        } else {
            showAuthError('An unexpected error occurred. Please try again.');
        }
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = originalText;
    }
}

async function resendOtp() {
    if (!window.registrationData) {
        showAuthError('Registration data not found. Please register again.');
        showRegister();
        return;
    }
    
    const resendBtn = document.getElementById('resendOtpBtn');
    const originalText = resendBtn.textContent;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/request-email-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: window.registrationData.email
            })
        }, 10000);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = getErrorMessage(response.status, errorData);
            showAuthError(errorMessage);
            return;
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            showAuthError(data.message || 'Failed to resend OTP');
            return;
        }
        
        showAuthError('New verification code sent!', 'success');
        
    } catch (error) {
        logError('Resend OTP', error);
        if (error.name === 'TimeoutError') {
            showAuthError('Request timed out. Please try again.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showAuthError('Cannot connect to server. Please check your internet connection.');
        } else {
            showAuthError('An unexpected error occurred. Please try again.');
        }
    } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = originalText;
    }
}

async function forgotPassword() {
    const email = document.getElementById('forgotEmail').value.trim();
    
    if (!email) {
        showAuthError('Please enter your email');
        return;
    }
    
    if (!isValidEmail(email)) {
        showAuthError('Please enter a valid email address');
        return;
    }
    
    const forgotBtn = document.getElementById('forgotBtn');
    const originalText = forgotBtn.textContent;
    forgotBtn.disabled = true;
    forgotBtn.textContent = 'Sending...';
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        }, 10000);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = getErrorMessage(response.status, errorData);
            showAuthError(errorMessage);
            return;
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            showAuthError(data.message || 'Failed to send reset email');
            return;
        }
        
        showAuthError('Password reset email sent! Check your inbox.', 'success');
        
    } catch (error) {
        logError('Forgot Password', error, { email });
        if (error.name === 'TimeoutError') {
            showAuthError('Request timed out. Please try again.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showAuthError('Cannot connect to server. Please check your internet connection.');
        } else {
            showAuthError('An unexpected error occurred. Please try again.');
        }
    } finally {
        forgotBtn.disabled = false;
        forgotBtn.textContent = originalText;
    }
}

async function verifyTokenAndConnect() {
    if (!accessToken) {
        showLogin();
        return;
    }
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/current-user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }, 5000);
        
        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.username) {
                currentUser = data.data.username;
                connectToChat();
            } else {
                throw new Error('Invalid user data received');
            }
        } else if (response.status === 401) {
            // Token expired, try to refresh
            await attemptTokenRefresh();
        } else {
            throw new Error(`Token verification failed with status ${response.status}`);
        }
    } catch (error) {
        logError('Token Verification', error);
        // Clear invalid tokens and show login
        clearAuthTokens();
        showLogin();
    }
}

async function attemptTokenRefresh() {
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }
    
    try {
        const response = await fetchWithTimeout('/api/v1/auth/refresh-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, 5000);
        
        if (response.ok) {
            const data = await response.json();
            if (data.data) {
                // Cookies updated by server; retry connection
                connectToChat();
            } else {
                throw new Error('Invalid refresh response');
            }
        } else {
            throw new Error(`Token refresh failed with status ${response.status}`);
        }
    } catch (error) {
        logError('Token Refresh', error);
        throw error;
    }
}

function clearAuthTokens() {
    try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
    } catch (error) {
        logError('Token Clear', error);
    }
    accessToken = '';
    refreshToken = '';
}

function connectToChat() {
    try {
        // Disconnect existing socket if any
        if (socket) {
            socket.disconnect();
        }
        
        // Connect to Socket.IO server with auth token
        socket = io({
            auth: {
                token: accessToken
            },
            withCredentials: true,
            timeout: 10000,
            forceNew: true
        });
        
        setupSocketListeners();
        showChatSection();
        
    } catch (error) {
        logError('Socket Connection', error);
        showConnectionStatus('Failed to connect to chat server', 'error');
        showLogin();
    }
}

function showLogin() {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    otpForm.classList.add('hidden');
    forgotPasswordForm.classList.add('hidden');
    authSection.classList.remove('hidden');
    chatSection.classList.add('hidden');
    clearAuthError();
    document.getElementById('loginEmail').focus();
}

function showRegister() {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    otpForm.classList.add('hidden');
    forgotPasswordForm.classList.add('hidden');
    clearAuthError();
    document.getElementById('registerUsername').focus();
}

function showOtpForm() {
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    otpForm.classList.remove('hidden');
    forgotPasswordForm.classList.add('hidden');
    clearAuthError();
    document.getElementById('otpInput').focus();
}

function showForgotPassword() {
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    otpForm.classList.add('hidden');
    forgotPasswordForm.classList.remove('hidden');
    clearAuthError();
    document.getElementById('forgotEmail').focus();
}

function showAuthError(message, type = 'error') {
    authError.textContent = message;
    authError.className = `error-message ${type}`;
    authError.style.display = 'block';
}

function clearAuthError() {
    authError.textContent = '';
    authError.style.display = 'none';
}

// Set up Socket.IO event listeners
function setupSocketListeners() {
    // Connection established
    socket.on('connect', () => {
        console.log('Connected to server');
        isReconnecting = false;
        reconnectAttempts = 0;
        showConnectionStatus('Connected to chat server', 'success');
    });
    
    // Connection error
    socket.on('connect_error', (error) => {
        logError('Socket Connect Error', error);
        showConnectionStatus('Connection failed. Retrying...', 'warning');
        
        if (!isReconnecting) {
            isReconnecting = true;
            attemptReconnection();
        }
    });
    
    // Disconnect
    socket.on('disconnect', (reason) => {
        logError('Socket Disconnect', new Error(reason));
        showConnectionStatus('Disconnected from server', 'warning');
        
        if (reason === 'io server disconnect') {
            // Server disconnected us, don't reconnect
            showAuthError('You have been disconnected from the server. Please log in again.');
            showLogin();
        } else if (reason === 'io client disconnect') {
            // Client disconnected, don't reconnect
        } else {
            // Network issues, attempt reconnection
            if (!isReconnecting) {
                isReconnecting = true;
                attemptReconnection();
            }
        }
    });
    
    // Login success
    socket.on('loginSuccess', async (data) => {
        try {
            if (!data || !data.username) {
                throw new Error('Invalid login success data');
            }
            
            const finalUsername = data.username;
            currentUserSpan.textContent = finalUsername;
            onlineUsers = Array.isArray(data.users) ? data.users : [];
            updateUserList(onlineUsers);

            // Fetch contacts after login and populate recipient list
            try {
                await fetchAndSetContacts();
                rebuildRecipientOptions();
            } catch (e) {
                logError('Contact Fetch', e);
                showConnectionStatus('Failed to load contacts', 'warning');
            }
        } catch (error) {
            logError('Login Success Handler', error);
            showAuthError('Login successful but failed to initialize chat');
        }
    });
    
    // Login error
    socket.on('loginError', (message) => {
        logError('Socket Login Error', new Error(message));
        showAuthError(message || 'Socket login failed');
        // If socket login fails, disconnect and show auth
        socket.disconnect();
        showLogin();
    });

    // Global auth errors
    socket.on('connect_error', (err) => {
        if (err && (err.message === 'AUTH_REQUIRED' || err.message === 'INVALID_TOKEN' || err.message === 'AUTH_FAILED')) {
            showAuthError('Authentication required. Please log in again.');
        }
    });
    
    // New message received
    socket.on('newMessage', (message) => {
        try {
            if (!message || !message.from || !message.to) {
                logError('Invalid Message Received', new Error('Missing required message fields'));
                return;
            }
            addMessageToChat(message, 'received');
            messageHistory.push(message);
        } catch (error) {
            logError('Message Handler', error);
        }
    });
    
    // Message sent confirmation
    socket.on('messageSent', (message) => {
        try {
            if (!message || !message.from || !message.to) {
                logError('Invalid Message Sent', new Error('Missing required message fields'));
                return;
            }
            addMessageToChat(message, 'sent');
            messageHistory.push(message);
        } catch (error) {
            logError('Message Sent Handler', error);
        }
    });
    
    // Message error
    socket.on('messageError', (error) => {
        logError('Socket Message Error', new Error(error));
        showMessageError(error || 'Message failed to send');
    });
    
    // User list update
    socket.on('userList', (users) => {
        try {
            onlineUsers = Array.isArray(users) ? users : [];
            updateUserList(onlineUsers);
            rebuildRecipientOptions();
        } catch (error) {
            logError('User List Handler', error);
        }
    });
    
    // User joined
    socket.on('userJoined', (username) => {
        try {
            if (!username || typeof username !== 'string') {
                logError('Invalid User Joined', new Error('Invalid username'));
                return;
            }
            addSystemMessage(`${username} joined the chat`);
            if (!onlineUsers.includes(username)) onlineUsers.push(username);
            updateUserList(onlineUsers);
            rebuildRecipientOptions();
        } catch (error) {
            logError('User Joined Handler', error);
        }
    });
    
    // User left
    socket.on('userLeft', (username) => {
        try {
            if (!username || typeof username !== 'string') {
                logError('Invalid User Left', new Error('Invalid username'));
                return;
            }
            addSystemMessage(`${username} left the chat`);
            onlineUsers = onlineUsers.filter(u => u !== username);
            updateUserList(onlineUsers);
            rebuildRecipientOptions();
        } catch (error) {
            logError('User Left Handler', error);
        }
    });
}

// Reconnection logic
function attemptReconnection() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        showConnectionStatus('Max reconnection attempts reached. Please refresh the page.', 'error');
        isReconnecting = false;
        return;
    }
    
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
    
    showConnectionStatus(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`, 'warning');
    
    setTimeout(() => {
        if (isReconnecting && socket) {
            try {
                socket.connect();
            } catch (error) {
                logError('Reconnection Attempt', error);
                attemptReconnection();
            }
        }
    }, delay);
}

// Auto-login to socket after authentication
function autoLoginToSocket() {
    if (socket && currentUser) {
        socket.emit('userLogin', currentUser);
    }
}

// Send message function
function sendMessage() {
    try {
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
        
        if (!socket || !socket.connected) {
            showMessageError('Not connected to chat server. Please refresh the page.');
            return;
        }
        
        if (message.length > 1000) {
            showMessageError('Message too long. Please keep it under 1000 characters.');
            return;
        }
        
        // Emit private message event
        socket.emit('privateMessage', {
            to: recipient,
            message: message
        });
        
        // Clear message input
        messageInput.value = '';
        
    } catch (error) {
        logError('Send Message', error);
        showMessageError('Failed to send message. Please try again.');
    }
}

// Logout function
async function logout() {
    try {
        // Call logout API with timeout
        if (accessToken) {
            await fetchWithTimeout('/api/v1/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }, 5000);
        }
    } catch (error) {
        logError('Logout API', error);
        // Continue with logout even if API call fails
    }
    
    // Disconnect socket
    if (socket) {
        try {
            socket.emit('logout');
            socket.disconnect();
        } catch (socketError) {
            logError('Socket Logout', socketError);
        }
    }
    
    // Clear tokens and state
    clearAuthTokens();
    currentUser = '';
    messageHistory = [];
    contacts = [];
    onlineUsers = [];
    selectedFile = null;
    isReconnecting = false;
    reconnectAttempts = 0;
    
    // Clear UI
    clearChat();
    clearUserList();
    
    // Show login section
    showLogin();
}

// Show chat section
function showChatSection() {
    authSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    // Auto-login to socket
    autoLoginToSocket();
}

// Fetch contacts for current user and rebuild recipient dropdown
async function fetchAndSetContacts() {
    if (!currentUser || !accessToken) {
        logError('Contact Fetch', new Error('Missing user or token'));
        return;
    }
    
    try {
        const res = await fetchWithTimeout(`/contacts?limit=200`, {
            headers: { 
                'Authorization': `Bearer ${accessToken}`
            }
        }, 10000);
        
        if (!res.ok) {
            if (res.status === 401) {
                // Token expired, try refresh
                try {
                    await attemptTokenRefresh();
                    // Retry with new token
                    const retryRes = await fetchWithTimeout(`/contacts?limit=200`, {
                        headers: { 
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }, 10000);
                    
                    if (retryRes.ok) {
                        const retryJson = await retryRes.json();
                        contacts = Array.isArray(retryJson.contacts) ? retryJson.contacts : [];
                        return;
                    }
                } catch (refreshError) {
                    logError('Contact Fetch Token Refresh', refreshError);
                }
            }
            throw new Error(`Failed to load contacts: ${res.status}`);
        }
        
        const json = await res.json();
        contacts = Array.isArray(json.contacts) ? json.contacts : [];
        
    } catch (error) {
        logError('Contact Fetch', error);
        contacts = []; // Set empty array on error
        throw error;
    }
}

function rebuildRecipientOptions() {
    const previouslySelected = recipientSelect.value;
    recipientSelect.innerHTML = '<option value="">Select recipient...</option>';

    // Fast lookups
    const onlineSet = new Set(onlineUsers);
    const contactUsernames = new Set(
        (contacts || []).map(c => c.username).filter(Boolean)
    );

    // 1) Add contacts by username first
    (contacts || []).forEach(contact => {
        const username = contact && contact.username;
        if (!username || username === currentUser) return;
        const isOnline = onlineSet.has(username);
        const option = document.createElement('option');
        option.value = username; // Socket messaging uses username
        option.textContent = isOnline ? `${username}` : `${username} (offline)`;
        recipientSelect.appendChild(option);
    });

    // 2) Add any other online users not already in contacts (and not self)
    (onlineUsers || []).forEach(username => {
        if (!username || username === currentUser) return;
        if (contactUsernames.has(username)) return; // already added from contacts
        const option = document.createElement('option');
        option.value = username;
        option.textContent = `${username}`; // online by definition here
        recipientSelect.appendChild(option);
    });

    // Restore previous selection if still available
    if (previouslySelected && Array.from(recipientSelect.options).some(o => o.value === previouslySelected)) {
        recipientSelect.value = previouslySelected;
    }
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

// These functions are now handled by showAuthError and clearAuthError

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
    
    if (!socket || !socket.connected) {
        console.log('❌ Socket not connected');
        showMessageError('Not connected to chat server. Please refresh the page.');
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
        
        // Upload file with timeout
        const response = await fetchWithTimeout('/upload', {
            method: 'POST',
            body: formData
        }, 60000); // 60 second timeout for file upload
        
        console.log('📡 Upload response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });
        
        if (!response.ok) {
            let serverMsg = 'Upload failed';
            try {
                const errJson = await response.json();
                serverMsg = errJson && errJson.error ? errJson.error : serverMsg;
            } catch (e) {
                try {
                    const errorText = await response.text();
                    serverMsg = errorText || serverMsg;
                } catch (textError) {
                    logError('Upload Error Parsing', textError);
                }
            }
            console.error('❌ Upload failed with status:', response.status, serverMsg);
            showMessageError(serverMsg);
            resetFileSelection();
            return;
        }
        
        const result = await response.json();
        console.log('✅ Upload result received:', result);
        
        if (!result.success) {
            console.log('❌ Upload response indicates failure:', result);
            showMessageError(result.error || 'Upload failed');
            resetFileSelection();
            return;
        }
        
        if (!result.file || !result.file.url) {
            console.log('❌ Invalid file response structure:', result);
            showMessageError('Invalid file response from server');
            resetFileSelection();
            return;
        }
        
        console.log('🎉 Upload successful, sending file message via Socket.IO...');
        
        // Send file message via Socket.IO
        const socketData = {
            to: recipient,
            message: `📎 File: ${selectedFile.name}`,
            file: result.file
        };
        
        console.log('📤 Socket.IO data:', socketData);
        
        try {
            socket.emit('privateMessage', socketData);
            console.log('✅ File message sent via Socket.IO');
            resetFileSelection();
        } catch (socketError) {
            logError('Socket File Send', socketError);
            showMessageError('File uploaded but failed to send message');
            resetFileSelection();
        }
        
    } catch (error) {
        logError('File Upload', error, {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            fileType: selectedFile.type,
            recipient: recipient
        });
        
        if (error.name === 'TimeoutError') {
            showMessageError('Upload timed out. Please try again with a smaller file.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showMessageError('Cannot connect to server. Please check your internet connection.');
        } else {
            showMessageError('Upload failed: ' + error.message);
        }
        
        resetFileSelection();
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
