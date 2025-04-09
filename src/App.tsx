import { useState } from "react"
import { Button } from "@/components/ui/button"
import { SendIcon, RefreshCw } from "lucide-react"

// Define types for messages and API
type MessageRole = 'user' | 'assistant';
type Message = { role: MessageRole; content: string };

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // API configuration from environment variables
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL_ID = "gemini-2.0-flash";
  
  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    // Add user message to chat
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      // Prepare the conversation history for Gemini API
      const contents = messages.concat(userMessage).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user', // Map to Gemini API roles
        parts: [{ text: msg.content }]
      }));
      
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              responseMimeType: "text/plain",
            }
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
      
      // Add AI response to chat
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, there was an error processing your request." }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-svh p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">Gemini Chat</h1>
      
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 rounded-lg border p-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            Start a conversation with Gemini...
          </div>
        ) : (
          messages.map((message, index) => (
            <div 
              key={index} 
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100 text-gray-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>
      
      {/* Input area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button onClick={handleSendMessage} disabled={isLoading}>
          <SendIcon className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={clearChat}>
          Clear
        </Button>
      </div>
    </div>
  )
}

export default App
