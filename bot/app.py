from flask import Flask, render_template, request, jsonify
import requests
import os
import traceback
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Get API key from environment
api_key = os.getenv('OPENAI_API_KEY')

# Store conversation history
conversation_history = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    try:
        if request.json is None:
            return jsonify({'error': 'Invalid request'}), 400
        
        user_message = request.json.get('message', '')
        
        if not user_message:
            return jsonify({'error': 'Empty message'}), 400
        
        # Add user message to conversation history
        conversation_history.append({"role": "user", "content": user_message})
        
        # Call the OpenAI API through OpenRouter
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "openai/gpt-3.5-turbo",
            "messages": conversation_history
        }
        
        print(f"Sending request to OpenRouter with payload: {payload}")
        
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload
        )
        
        print(f"Received response with status code: {response.status_code}")
        print(f"Response content: {response.text}")
        
        if response.status_code != 200:
            error_msg = f'API request failed with status {response.status_code}: {response.text}'
            print(error_msg)
            return jsonify({'error': error_msg}), 500
        
        # Extract the assistant's reply
        response_data = response.json()
        assistant_message = response_data['choices'][0]['message']['content']
        
        # Add assistant message to conversation history
        conversation_history.append({"role": "assistant", "content": assistant_message})
        
        return jsonify({'reply': assistant_message})
    except Exception as e:
        error_msg = f"Exception occurred: {str(e)}\nTraceback: {traceback.format_exc()}"
        print(error_msg)
        return jsonify({'error': error_msg}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)