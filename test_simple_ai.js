// Simple test to see if AI chat works at all
const testAI = async () => {
  try {
    const response = await fetch('/internal/call_mcp_tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'ai_chat',
        arguments: {
          messages: 'Say hello',
          model: 'gemini-2.5-pro',
          include_thoughts: false
        }
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    return data;
  } catch (error) {
    console.error('AI test failed:', error);
    return null;
  }
};

// Run the test
console.log('Testing AI...');
testAI();