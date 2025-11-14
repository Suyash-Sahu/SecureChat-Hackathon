import { ApiError } from '../auth/utils/api-error.js';
import { ApiResponse } from '../auth/utils/api-response.js';
import { asyncHandler } from '../auth/utils/async-handler.js';
import axios from 'axios';

// Store conversation history per user (in production, you might want to use Redis or a database)
const userConversations = new Map();

// AI chat function
const aiChat = asyncHandler(async (req, res) => {
    try {
        const { message } = req.body;
        const userId = req.user._id;
        
        // Validate input
        if (!message || typeof message !== 'string') {
            throw new ApiError(400, 'Message is required and must be a string');
        }
        
        // Get or create conversation history for this user
        if (!userConversations.has(userId)) {
            userConversations.set(userId, []);
        }
        
        const conversationHistory = userConversations.get(userId);
        
        // Add user message to conversation history
        conversationHistory.push({ role: "user", content: message });
        
        // Get API key from environment variables
        const apiKey = process.env.OPENAI_API_KEY;
        
        if (!apiKey) {
            throw new ApiError(500, 'AI service not configured properly');
        }
        
        // Call the OpenAI API through OpenRouter
        const headers = {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        };
        
        const payload = {
            model: "openai/gpt-3.5-turbo",
            messages: conversationHistory
        };
        
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            payload,
            { headers }
        );
        
        if (response.status !== 200) {
            throw new ApiError(500, `AI service error: ${response.statusText}`);
        }
        
        // Extract the assistant's reply
        const assistantMessage = response.data.choices[0].message.content;
        
        // Add assistant message to conversation history
        conversationHistory.push({ role: "assistant", content: assistantMessage });
        
        // Keep conversation history to a reasonable size
        if (conversationHistory.length > 20) {
            conversationHistory.shift();
        }
        
        return res.status(200).json(
            new ApiResponse(200, { reply: assistantMessage }, "Message sent successfully")
        );
    } catch (error) {
        console.error("AI chat error:", error);
        throw new ApiError(500, `Failed to process AI chat: ${error.message}`);
    }
});

export { aiChat };