import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SendIcon, RefreshCw, PlusCircle, X, Save, Check, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Define types for messages, examples and API
type MessageRole = 'user' | 'assistant';
type Message = { role: MessageRole; content: string };

// Define the Example types for few-shot learning
type ExampleType = 'input-output' | 'title-content';

type Example = {
  type: ExampleType;
  firstField: string;
  secondField: string;
};

// Labels for different example types
const exampleTypeLabels: Record<ExampleType, { first: string, second: string }> = {
  'input-output': { first: 'Input', second: 'Output' },
  'title-content': { first: 'Title', second: 'Content' },
};

// localStorage key for saving examples
const EXAMPLES_STORAGE_KEY = 'few-shot-chatbot-examples';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Examples for few-shot learning
  const [examples, setExamples] = useState<Example[]>([]);
  const [newExample, setNewExample] = useState<Example>({ 
    type: 'input-output',
    firstField: "", 
    secondField: "" 
  });
  const [isAddingExample, setIsAddingExample] = useState(false);
  
  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  
  // Load examples from localStorage on component mount
  useEffect(() => {
    const savedExamples = localStorage.getItem(EXAMPLES_STORAGE_KEY);
    if (savedExamples) {
      try {
        const parsedExamples = JSON.parse(savedExamples);
        setExamples(parsedExamples);
      } catch (error) {
        console.error("Failed to parse saved examples:", error);
      }
    }
  }, []);
  
  // Save examples to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(EXAMPLES_STORAGE_KEY, JSON.stringify(examples));
  }, [examples]);
  
  const handleSendMessage = async () => {
    if (!input.trim()) return;
    
    // Add user message to chat
    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      let contents = [];
      
      // Add examples with clear labeling if there are any
      if (examples.length > 0) {
        // Add a system message explaining the examples and few-shot learning
        contents.push({
          role: 'user' as const,
          parts: [{ text: "I'm using FEW-SHOT LEARNING to guide your responses. I'll provide some examples of the format I want you to follow. Please analyze these examples carefully to understand the pattern, and then apply the same pattern to your responses to my actual queries." }]
        });
        
        contents.push({
          role: 'model' as const,
          parts: [{ text: "I understand. I'll use the few-shot learning examples to guide my responses and follow the same patterns you demonstrate." }]
        });
        
        // Add each example with clear labels
        examples.forEach((example, idx) => {
          const labels = exampleTypeLabels[example.type];
          
          contents.push({
            role: 'user' as const,
            parts: [{ text: `EXAMPLE ${idx + 1} - ${labels.first.toUpperCase()}:\n${example.firstField}` }]
          });
          
          contents.push({
            role: 'model' as const,
            parts: [{ text: `EXAMPLE ${idx + 1} - ${labels.second.toUpperCase()}:\n${example.secondField}` }]
          });
        });
        
        // Add a transition message
        contents.push({
          role: 'user' as const,
          parts: [{ text: "Now that you've seen the few-shot learning examples, please respond to my actual queries following the same patterns demonstrated in the examples." }]
        });
        
        contents.push({
          role: 'model' as const,
          parts: [{ text: "I'll respond to your queries using the patterns demonstrated in the few-shot learning examples." }]
        });
      }
      
      // Then add the actual conversation
      const conversationContents = messages.concat(userMessage).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user' as const,
        parts: [{ text: msg.content }]
      }));
      
      // Combine examples with conversation
      contents = [...contents, ...conversationContents];
      
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
  
  const addExample = () => {
    if (newExample.firstField.trim() && newExample.secondField.trim()) {
      setExamples([...examples, { ...newExample }]);
      setNewExample({ 
        type: newExample.type, // Keep the same type for convenience
        firstField: "", 
        secondField: "" 
      });
      setIsAddingExample(false);
    }
  };
  
  const selectExampleType = (type: ExampleType) => {
    setNewExample({ 
      type: type,
      firstField: "", 
      secondField: "" 
    });
    setIsAddingExample(true);
  };
  
  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };
  
  const startEditing = (index: number, field: 'firstField' | 'secondField') => {
    setEditingIndex(index);
    setEditingField(field);
    setEditValue(examples[index][field]);
  };
  
  const saveEdit = () => {
    if (editingIndex !== null && editingField !== null && editValue.trim()) {
      const updatedExamples = [...examples];
      updatedExamples[editingIndex] = {
        ...updatedExamples[editingIndex],
        [editingField]: editValue
      };
      setExamples(updatedExamples);
      setEditingIndex(null);
      setEditingField(null);
    }
  };
  
  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingField(null);
  };
  
  const changeExampleType = (index: number, type: ExampleType) => {
    const updatedExamples = [...examples];
    updatedExamples[index] = {
      ...updatedExamples[index],
      type
    };
    setExamples(updatedExamples);
  };
  
  // For inline editing examples
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'firstField' | 'secondField' | null>(null);
  const [editValue, setEditValue] = useState("");

  // API configuration from environment variables
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL_ID = "gemini-2.0-flash";

  return (
    <div className="flex flex-col h-svh p-4 max-w-3xl mx-auto bg-background text-foreground">
      <h1 className="text-2xl font-bold text-center mb-4">Few-Shot Chatbot</h1>
      
      {/* Examples Section */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Examples</h2>
          
          {!isAddingExample && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <PlusCircle className="h-4 w-4" />
                  Add Example
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem 
                  onClick={() => selectExampleType('input-output')}
                  className="cursor-pointer"
                >
                  Input-Output
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => selectExampleType('title-content')}
                  className="cursor-pointer"
                >
                  Title-Content
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        {/* Example list */}
        <div className="space-y-2 mb-2">
          {examples.map((example, index) => {
            const labels = exampleTypeLabels[example.type];
            return (
              <div key={index} className="border rounded-lg p-3 bg-card text-card-foreground shadow-sm">
                <div className="flex justify-between mb-1">
                  <div className="font-medium text-sm text-muted-foreground flex items-center">
                    <span>Example {index + 1}</span>
                    <div className="ml-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 flex items-center gap-1 px-2 text-xs font-normal"
                          >
                            {example.type === 'input-output' ? 'Input-Output' : 'Title-Content'}
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-32">
                          <DropdownMenuItem 
                            onClick={() => changeExampleType(index, 'input-output')}
                            className={`cursor-pointer ${example.type === 'input-output' ? 'font-medium' : ''}`}
                          >
                            Input-Output
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => changeExampleType(index, 'title-content')}
                            className={`cursor-pointer ${example.type === 'title-content' ? 'font-medium' : ''}`}
                          >
                            Title-Content
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground" 
                    onClick={() => removeExample(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm">
                  <div className="mb-1">
                    <span className="font-medium">{labels.first}:</span>{" "}
                    {editingIndex === index && editingField === 'firstField' ? (
                      <div className="flex items-center mt-1">
                        <textarea 
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 p-1 border rounded text-sm bg-background text-foreground focus:outline-none focus:border-input"
                          rows={2}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveEdit();
                            } else if (e.key === 'Escape') {
                              cancelEdit();
                            }
                          }}
                        />
                        <div className="flex flex-col ml-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0 mb-1 text-green-500" 
                            onClick={saveEdit}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0 text-muted-foreground" 
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span 
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-1 rounded"
                        onClick={() => startEditing(index, 'firstField')}
                      >
                        {example.firstField}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-medium">{labels.second}:</span>{" "}
                    {editingIndex === index && editingField === 'secondField' ? (
                      <div className="flex items-center mt-1">
                        <textarea 
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 p-1 border rounded text-sm bg-background text-foreground focus:outline-none focus:border-input"
                          rows={2}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveEdit();
                            } else if (e.key === 'Escape') {
                              cancelEdit();
                            }
                          }}
                        />
                        <div className="flex flex-col ml-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0 mb-1 text-green-500" 
                            onClick={saveEdit}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 w-5 p-0 text-muted-foreground" 
                            onClick={cancelEdit}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span 
                        className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-1 rounded"
                        onClick={() => startEditing(index, 'secondField')}
                      >
                        {example.secondField}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Add example form */}
        {isAddingExample && (
          <div className="border rounded-lg p-3 bg-card text-card-foreground shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center">
                <label className="block text-sm font-medium mr-2">Example Type:</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 flex items-center gap-1 px-2 text-sm"
                    >
                      {newExample.type === 'input-output' ? 'Input-Output' : 'Title-Content'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-32">
                    <DropdownMenuItem 
                      onClick={() => setNewExample({ ...newExample, type: 'input-output' })}
                      className={`cursor-pointer ${newExample.type === 'input-output' ? 'font-medium' : ''}`}
                    >
                      Input-Output
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setNewExample({ ...newExample, type: 'title-content' })}
                      className={`cursor-pointer ${newExample.type === 'title-content' ? 'font-medium' : ''}`}
                    >
                      Title-Content
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button 
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setIsAddingExample(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="mb-2">
              <label className="block text-sm font-medium mb-1">
                {exampleTypeLabels[newExample.type].first}:
              </label>
              <textarea 
                value={newExample.firstField}
                onChange={(e) => setNewExample({ ...newExample, firstField: e.target.value })}
                className="w-full p-2 border rounded text-sm bg-background text-foreground focus:outline-none focus:border-input"
                rows={2}
                placeholder={`Enter ${exampleTypeLabels[newExample.type].first.toLowerCase()} here...`}
              />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">
                {exampleTypeLabels[newExample.type].second}:
              </label>
              <textarea 
                value={newExample.secondField}
                onChange={(e) => setNewExample({ ...newExample, secondField: e.target.value })}
                className="w-full p-2 border rounded text-sm bg-background text-foreground focus:outline-none focus:border-input"
                rows={2}
                placeholder={`Enter ${exampleTypeLabels[newExample.type].second.toLowerCase()} here...`}
              />
            </div>
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={addExample}
                className="flex items-center gap-1"
                disabled={!newExample.firstField.trim() || !newExample.secondField.trim()}
              >
                <Save className="h-4 w-4" />
                Save Example
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 rounded-lg border p-4 bg-card/30 backdrop-blur-sm">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Add examples above, then start a conversation...
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
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-secondary-foreground'
                } shadow-sm`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-secondary text-secondary-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>
      
      {/* Input area */}
      <div className="flex gap-2">
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message..."
          className="flex-1 bg-background text-foreground"
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
