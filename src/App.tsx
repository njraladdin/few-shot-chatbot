import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"

import { SendIcon, RefreshCw, Check, ChevronDown, Copy, CheckCheck, PanelLeftClose, PanelLeftOpen, Settings, ChevronLeft, ChevronRight, PlusSquare, Trash2, Edit, Play, InfoIcon, Box } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import 'highlight.js/styles/github-dark.css'
import copy from 'copy-to-clipboard'
import PromptTemplateEditor, { PromptTemplate, PROMPT_TEMPLATE_STORAGE_KEY, createDefaultTemplate } from "@/components/PromptTemplate"
import Examples, { Example,  EXAMPLES_STORAGE_KEY, exampleTypeLabels } from "@/components/Examples"

// Define types for messages, examples and API
type MessageRole = 'user' | 'assistant';
type Message = { 
  role: MessageRole; 
  content: string; 
  id?: string;
  activeExampleIds?: string[]; // This field is now deprecated but kept for backward compatibility
};

// For model selection
type Model = {
  name: string;
  displayName: string;
  version?: string;
  description?: string;
};

// For message type selection
type MessageType = 'text' | 'template';

// Local storage key for messages
export const MESSAGES_STORAGE_KEY = 'few-shot-chatbot-messages';
// Local storage key for selected model
export const SELECTED_MODEL_STORAGE_KEY = 'few-shot-chatbot-selected-model';
// Local storage key for API key
export const API_KEY_STORAGE_KEY = 'few-shot-chatbot-api-key';

// Function to format prompt template for API - moved here from PromptTemplate.tsx
const formatPromptTemplate = (template: PromptTemplate): string => {
  return template.inputs.map(input => {
    return `${input.description}:\n${input.content}`;
  }).join('\n\n');
};

// Add a new memoized formatter near the existing token estimation functions
// This will only recalculate when examples or templates actually change
const useExamplesAndTemplateFormatter = (
  examples: Example[],
  promptTemplate: PromptTemplate
) => {
  // Cache the formatted content and its token count
  const [formattedExamples, setFormattedExamples] = useState<string>("");
  const [formattedTemplate, setFormattedTemplate] = useState<string>("");
  
  // Cache computation references
  const examplesRef = useRef<Example[]>(examples);
  const templateRef = useRef<PromptTemplate>(promptTemplate);
  
  // Update the examples format and token count when examples change
  useEffect(() => {
    // Skip if no change
    if (examplesRef.current === examples && examples.length === examplesRef.current.length) {
      return;
    }
    
    // Update reference
    examplesRef.current = examples;
    
    // Format examples
    let examplesText = "";
    examples.forEach((example) => {
      const labels = exampleTypeLabels[example.type];
      examplesText += `${labels.first}:\n${example.firstField}\n\n`;
      examplesText += `${labels.second}:\n${example.secondField}\n\n\n`;
    });
    
    setFormattedExamples(examplesText);
    
  }, [examples, formattedTemplate]);
  
  // Update the template format and token count when template changes
  useEffect(() => {
    // Skip if no change
    if (templateRef.current === promptTemplate) {
      return;
    }
    
    // Update reference
    templateRef.current = promptTemplate;
    
    // Format template
    const templateText = formatPromptTemplate(promptTemplate);
    
    // Only log a truncated version to avoid console spam
    if (templateText.length > 500) {
      console.log('[Debug] Template content (truncated):', templateText.substring(0, 500) + '...');
    } else if (templateText.length > 0) {
      console.log('[Debug] Template content:', templateText);
    }
    
    setFormattedTemplate(templateText);
    
  }, [promptTemplate, formattedExamples]);
  
  // Return the formatted content and token count
  return {
    formattedExamples,
    formattedTemplate,
    // Helper to get API contents
    getExamplesAndTemplateContents: useCallback(() => {
      const contents: any[] = [];
      
      // Add examples if any
      if (formattedExamples) {
        contents.push({
          role: 'user' as const,
          parts: [{ text: formattedExamples }]
        });
      }
      
      // Add template if any
      if (formattedTemplate) {
        contents.push({
          role: 'user' as const,
          parts: [{ text: formattedTemplate }]
        });
      }
      
      return contents;
    }, [formattedExamples, formattedTemplate])
  };
};

// Check if localStorage is available
const isLocalStorageAvailable = () => {
  try {
    const testKey = 'test-localStorage';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    console.error('localStorage is not available:', e);
    return false;
  }
};

// Add performance monitoring for UI updates
function useRenderCount(componentName: string) {
  const count = useRef(0);
  count.current++;
  
  useEffect(() => {
    console.log(`${componentName} rendered (${count.current})`);
  });
}

function App() {
  // Performance tracking for the App component
  useRenderCount('App');
  const renderStartTime = useRef(performance.now());
  
  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    console.log(`App render completed in ${renderTime}ms`);
    renderStartTime.current = performance.now();
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
        if (savedMessages) {
          console.log('Initializing messages from localStorage');
          return JSON.parse(savedMessages);
        }
      } catch (error) {
        console.error("Failed to load messages from localStorage during initialization:", error);
      }
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // API key state
  const [apiKey, setApiKey] = useState<string>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (savedApiKey) {
          return savedApiKey;
        }
      } catch (error) {
        console.error("Failed to load API key from localStorage:", error);
      }
    }
    return import.meta.env.VITE_GEMINI_API_KEY || "";
  });
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  
  // Function to save API key to localStorage
  const saveApiKey = (key: string) => {
    setApiKey(key);
    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
        console.log('API key saved to localStorage');
      } catch (error) {
        console.error("Failed to save API key to localStorage:", error);
      }
    }
  };
  
  // Initialize temp API key when dialog opens
  useEffect(() => {
    if (isConfigDialogOpen) {
      setTempApiKey(apiKey);
    }
  }, [isConfigDialogOpen, apiKey]);
  
  // Model selection constant
  const models: Model[] = [
        { name: "gemini-2.5-pro-preview-03-25", displayName: "Gemini 2.5 Pro Preview" },
        { name: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
        { name: "gemini-2.0-flash-thinking-exp-01-21", displayName: "Gemini 2.0 Flash Thinking" },
      ];
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedModel = localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
        if (savedModel) {
          return savedModel;
        }
      } catch (error) {
        console.error("Failed to load selected model from localStorage:", error);
      }
    }
    return "gemini-2.0-flash"; // Default model
  });
  
  // Sidebar state - now with individual section toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isExamplesOpen, setIsExamplesOpen] = useState(true);
  const [isTemplateOpen, setIsTemplateOpen] = useState(true);
  
  // For auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Add ref for chat container to enable auto-scrolling
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Function to smoothly scroll to bottom of chat
  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Note: The original resizeTextarea function has been replaced with an instrumented version below
  
  // Examples for few-shot learning - initialize with data from localStorage if it exists
  const [examples, setExamples] = useState<Example[]>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedExamples = localStorage.getItem(EXAMPLES_STORAGE_KEY);
        if (savedExamples) {
          console.log('Initializing examples from localStorage');
          const parsedExamples = JSON.parse(savedExamples);
          // Ensure all examples have IDs
          return parsedExamples.map((ex: any) => ({
            ...ex,
            id: ex.id || `example-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
          }));
        }
      } catch (error) {
        console.error("Failed to load examples from localStorage during initialization:", error);
      }
    }
    return [];
  });
  
  // Prompt template for few-shot learning - initialize with data from localStorage if it exists
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplate>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedTemplate = localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY);
        if (savedTemplate) {
          console.log('Initializing prompt template from localStorage');
          return JSON.parse(savedTemplate);
        }
      } catch (error) {
        console.error("Failed to load prompt template from localStorage during initialization:", error);
      }
    }
    
    // Return default template if none exists
    return createDefaultTemplate();
  });
  
  // For message editing
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (isLocalStorageAvailable()) {
      try {
        const messagesJSON = JSON.stringify(messages);
        localStorage.setItem(MESSAGES_STORAGE_KEY, messagesJSON);
        console.log('Messages saved to localStorage:', messages);
      } catch (error) {
        console.error("Failed to save messages to localStorage:", error);
      }
    }
  }, [messages]);
  
  // Save selected model to localStorage whenever it changes
  useEffect(() => {
    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel);
        console.log('Selected model saved to localStorage:', selectedModel);
      } catch (error) {
        console.error("Failed to save selected model to localStorage:", error);
      }
    }
  }, [selectedModel]);
  


  
  // Use our new formatter hook to efficiently manage examples and template
  const {
    formattedExamples,
    formattedTemplate,
    getExamplesAndTemplateContents
  } = useExamplesAndTemplateFormatter(examples, promptTemplate);
  

  

  // Add tracking for input changes
  useEffect(() => {
    console.log(`Input changed to length: ${input.length}`);
  }, [input]);
  

  
  // Save examples to localStorage whenever they change
  useEffect(() => {
    if (isLocalStorageAvailable() && (examples.length > 0 || localStorage.getItem(EXAMPLES_STORAGE_KEY))) {
      try {
        const examplesJSON = JSON.stringify(examples);
        localStorage.setItem(EXAMPLES_STORAGE_KEY, examplesJSON);
        console.log('Examples saved to localStorage:', examples);
      } catch (error) {
        console.error("Failed to save examples to localStorage:", error);
      }
    }
  }, [examples]);
  
  // Generate API payload only when actually needed (not on every keystroke)
  const generateApiPayload = useCallback((
    currentMessages: Message[],
    additionalMessage: Message | null = null
  ) => {
    // Start with static content
    const contents = getExamplesAndTemplateContents();
    
    // Add conversation messages
    const conversationMessages = additionalMessage 
      ? [...currentMessages, additionalMessage] 
      : currentMessages;
    
    conversationMessages.forEach(msg => {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user' as const,
        parts: [{ text: msg.content }]
      });
    });
    
    // Log simplified payload info (not the huge payload itself)
    console.log('[Debug] Payload info:', {
      examplesCount: examples.length,
      hasPromptTemplate: !!promptTemplate?.inputs?.length,
      messagesCount: conversationMessages.length
    });
    
    return contents;
  }, [examples.length, promptTemplate, getExamplesAndTemplateContents]);
  
  // Optimized handleSendMessage function
  const handleSendMessage = async () => {
    // Require input text
    if (!input.trim()) {
      return;
    }
    
    // Check if API key is set
    if (!apiKey) {
      setIsConfigDialogOpen(true);
      return;
    }
    
    // Create user message
    const userMessage: Message = { 
      role: 'user', 
      content: input,
      id: `user-${Date.now()}`
    };
    
    // Add user message to chat
    setMessages(prev => [...prev, userMessage]);
    
    // Reset input
    setInput("");
    
    setIsLoading(true);
    
    // Scroll to bottom immediately when sending a message
    scrollToBottom(false);
    
    try {
      // Generate API payload only when needed
      const contents = generateApiPayload(messages, userMessage);
      
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, 
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
      
      console.log('[Debug] API request sent:', {
        model: selectedModel,
        messageCount: contents.length,
        requestSize: JSON.stringify({contents}).length,
        timestamp: new Date().toISOString()
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
      
      // Add AI response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: aiResponse,
        id: `assistant-${Date.now()}`
      }]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      // Extract the error message - show the specific error instead of a generic message
      const errorMessage = error instanceof Error 
        ? `Error: ${error.message}` 
        : "Unknown error occurred";
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Failed to get response from Gemini API. ${errorMessage}`,
        id: `error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const clearChat = () => {
    setMessages([]);
    // Also clear from localStorage
    if (isLocalStorageAvailable()) {
      localStorage.removeItem(MESSAGES_STORAGE_KEY);
    }
    
  };
  
  // Functions for editing messages
  const startEditingMessage = (index: number) => {
    setEditingMessageIndex(index);
    setEditingMessageContent(messages[index].content);
  };
  
  const saveMessageEdit = () => {
    if (editingMessageIndex !== null && editingMessageContent.trim()) {
      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = {
        ...updatedMessages[editingMessageIndex],
        content: editingMessageContent
      };
      setMessages(updatedMessages);
      setEditingMessageIndex(null);
    }
  };
  
  const cancelMessageEdit = () => {
    setEditingMessageIndex(null);
  };
  
  // Run conversation from a specific message
  const runFromMessage = async (index: number) => {
    // Check if API key is set
    if (!apiKey) {
      setIsConfigDialogOpen(true);
      return;
    }
    
    // Keep messages up to and including the selected index
    const truncatedMessages = messages.slice(0, index + 1);
    setMessages(truncatedMessages);
    
    const selectedMessage = messages[index];
    
    if (selectedMessage.role === 'user') {
      setIsLoading(true);
      
      try {
        // Generate API payload only when needed (using truncated messages)
        const contents = generateApiPayload(truncatedMessages);
        
        // Call Gemini API
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, 
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
        
        console.log('[Debug] API request sent:', {
          model: selectedModel,
          messageCount: contents.length,
          requestSize: JSON.stringify({contents}).length,
          timestamp: new Date().toISOString()
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
        
        // Add AI response to chat without active examples
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: aiResponse,
          id: `assistant-${Date.now()}`
        }]);
      } catch (error) {
        console.error("Error calling Gemini API:", error);
        // Extract the error message - show the specific error instead of a generic message
        const errorMessage = error instanceof Error 
          ? `Error: ${error.message}` 
          : "Unknown error occurred";
        
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Failed to get response from Gemini API. ${errorMessage}`,
          id: `error-${Date.now()}`
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Add a new function to run examples and template without a user message
  const handleRunExamplesAndTemplate = async () => {
    // Check if API key is set
    if (!apiKey) {
      setIsConfigDialogOpen(true);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Create a special system message explaining what we're doing
      const systemMessage: Message = { 
        role: 'user', 
        content: "Based on the information provided above, please respond following the instructions.",
        id: `system-${Date.now()}`
      };
      
      // Add the system message to chat
      setMessages(prev => [...prev, systemMessage]);
      
      // Scroll to bottom immediately when running examples/template
      scrollToBottom(false);
      
      // Generate API payload only when needed
      const contents = generateApiPayload(messages, systemMessage);
      
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, 
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
      
      console.log('[Debug] API request sent:', {
        model: selectedModel,
        messageCount: contents.length,
        requestSize: JSON.stringify({contents}).length,
        timestamp: new Date().toISOString()
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";
      
      // Add AI response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: aiResponse,
        id: `assistant-${Date.now()}`
      }]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      // Extract the error message - show the specific error instead of a generic message
      const errorMessage = error instanceof Error 
        ? `Error: ${error.message}` 
        : "Unknown error occurred";
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Failed to get response from Gemini API. ${errorMessage}`,
        id: `error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  
  // Add logging to setInput with performance tracking
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const start = performance.now();
    console.log('handleInputChange called', e.target.value.length);
    setInput(e.target.value);
    const end = performance.now();
    console.log(`setInput operation took ${end - start}ms`);
  };
  
  // Optimize textarea render performance with memoized styles
  const textareaStyle = useMemo(() => {
    return { 
      height: textareaRef.current?.scrollHeight 
        ? `${Math.min(textareaRef.current.scrollHeight, 180)}px` 
        : '60px' 
    };
  }, []);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const start = performance.now();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    const end = performance.now();
    console.log(`keyDown handler took ${end - start}ms`);
  }, [handleSendMessage]);
  
  return (
    <div className="flex flex-col h-screen min-h-svh bg-background text-foreground antialiased">
      {/* Global Header - Spans the entire width */}
      <header className="flex-shrink-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-full mx-auto px-6 sm:px-8"> 
          <div className="flex items-center justify-between h-14">
            {/* Sidebar Toggle Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-muted-foreground hover:text-foreground transition-colors duration-200"
              title={isSidebarOpen ? "Hide examples & template" : "Show examples & template"}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </Button>

            {/* Centered Title */}
            <div className="flex-grow flex items-center justify-center">
              <a href="/" className="text-xl font-semibold tracking-tight text-foreground flex items-center">
                <PlusSquare className="h-[18px] w-[18px] mr-2 rounded-full bg-primary/10 p-1" />
                <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Few-Shot Chatbot</span>
              </a>
            </div>

            {/* API key config dialog */}
            <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="relative text-muted-foreground hover:text-foreground transition-colors duration-200"
                  title="API key configuration"
                >
                  <Settings className="h-5 w-5" />
                  {!apiKey && (
                    <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></div>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>API Key Configuration</DialogTitle>
                  <DialogDescription>
                    Enter your Gemini API key. This will be saved in your browser's local storage.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 mb-4">
                  <Input
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="Enter Gemini API key"
                    className="w-full"
                    type="password"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => {
                    saveApiKey(tempApiKey);
                    setIsConfigDialogOpen(false);
                  }}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content Area with Sidebar and Conversation */}
      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar with side-by-side Examples and Template sections */}
        <div className={`flex-shrink-0 border-r border-border/30 transition-all duration-300 ${
          isSidebarOpen 
            ? (isExamplesOpen && isTemplateOpen) 
                ? 'w-[40%] max-w-[1000px]' // Full width when both are open
                : (isExamplesOpen || isTemplateOpen)
                    ? 'w-[30%] max-w-[800px]' // 30% width when only one is open
                    : 'w-[300px]' // Width for both collapsed sections with titles (150px + 150px)
            : 'w-0 overflow-hidden'
        }`}>
          {/* Vertical split layout for Examples and Template */}
          <div className="flex h-full bg-background/50">
            {/* Examples Section - Left side */}
            <div className={`flex flex-col h-full border-r border-border/40 transition-all duration-300 ${
              !isExamplesOpen
                ? 'w-[150px]' // Increased width for collapsed state
                : !isTemplateOpen
                  ? 'w-[calc(100%-150px)]' // When template is collapsed, examples take most space
                  : 'w-1/2' // Equal split when both are open
            }`}>
              {/* Examples Header - Entire header is clickable */}
              <div 
                className="h-12 border-b border-border/30 flex items-center bg-card/40 cursor-pointer transition-colors hover:bg-card/80"
                onClick={() => setIsExamplesOpen(!isExamplesOpen)}
                title={isExamplesOpen ? "Collapse examples" : "Expand examples"}
              >
                <div className={`flex items-center justify-between w-full ${isExamplesOpen ? 'px-3' : 'px-4'}`}>
                  <h3 className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                    <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Examples</span>
                    {examples.length > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0 rounded-full flex-shrink-0 min-w-[18px] text-center">
                        {examples.length}
                      </span>
                    )}
                  </h3>
                  
                  {/* Direction indicator - shown as compact version when collapsed */}
                  {isExamplesOpen ? (
                    <div className="flex justify-center items-center h-7 w-7 text-muted-foreground flex-shrink-0">
                      <ChevronLeft className="h-[14px] w-[14px]" />
                    </div>
                  ) : (
                    <div className="flex justify-center items-center h-5 w-5 text-muted-foreground bg-transparent flex-shrink-0 ">
                      <ChevronRight className="h-[12px] w-[12px]" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Examples Content */}
              {isExamplesOpen && (
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-background/20 hover:scrollbar-thumb-border/70 p-4 pb-6">
                  <Examples 
                    examples={examples} 
                    setExamples={setExamples as React.Dispatch<React.SetStateAction<Example[]>>} 
                    activeExampleIds={[]} 
                    setActiveExampleIds={() => {}}
                    showExampleManager={false}
                    setShowExampleManager={() => {}}
                  />
                </div>
              )}
            </div>
            
            {/* Template Section - Right side */}
            <div className={`flex flex-col h-full transition-all duration-300 ${
              !isTemplateOpen
                ? 'w-[150px]' // Increased width for collapsed state
                : !isExamplesOpen
                  ? 'w-[calc(100%-150px)]' // When examples are collapsed, template takes most space
                  : 'w-1/2' // Equal split when both are open
            }`}>
              {/* Template Header - Now entire header is clickable */}
              <div 
                className="h-12 border-b border-border/30 flex items-center bg-card/40 cursor-pointer transition-colors hover:bg-card/80"
                onClick={() => setIsTemplateOpen(!isTemplateOpen)}
                title={isTemplateOpen ? "Collapse prompt template" : "Expand prompt template"}
              >
                <div className={`flex items-center justify-between w-full ${isTemplateOpen ? 'px-3' : 'px-4'}`}>
                  <h3 className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                    <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Prompt Template</span>
                    {promptTemplate?.inputs?.length > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0 rounded-full flex-shrink-0 min-w-[18px] text-center">
                        {promptTemplate.inputs.length}
                      </span>
                    )}
                  </h3>
                  
                  {/* Direction indicator - shown as compact version when collapsed */}
                  {isTemplateOpen ? (
                    <div className="flex justify-center items-center h-7 w-7 text-muted-foreground flex-shrink-0">
                      <ChevronLeft className="h-[14px] w-[14px]" />
                    </div>
                  ) : (
                    <div className="flex justify-center items-center h-5 w-5 text-muted-foreground bg-transparent flex-shrink-0 ">
                      <ChevronRight className="h-[12px] w-[12px]" />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Template Content */}
              {isTemplateOpen && (
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-background/20 hover:scrollbar-thumb-border/70 p-4 pb-6">
                  <PromptTemplateEditor 
                    promptTemplate={promptTemplate}
                    setPromptTemplate={setPromptTemplate}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Conversation Area */}
        <div className="flex flex-col flex-grow h-full overflow-hidden">
          {/* Conversation Title Bar */}
          <div className="flex-shrink-0 border-b border-border/30 bg-background/80 backdrop-blur-sm">
            <div className="flex items-center justify-between h-12 px-6">
              <h2 className="text-sm font-medium flex items-center gap-4">
                <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Conversation</span>
                
                <div className="flex items-center gap-2">
     
                  {/* Model selector dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs flex items-center gap-1.5 bg-background/70 text-muted-foreground h-7 px-3 border-border/20 shadow-sm hover:bg-background"
                      >
                        <Box className="h-[10px] w-[10px] flex-shrink-0" />
                        <span className="truncate max-w-28">
                          {models.find((m: Model) => m.name === selectedModel)?.displayName || selectedModel}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-70 flex-shrink-0 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {models.map((model) => (
                        <DropdownMenuItem 
                          key={model.name}
                          className={`flex items-center justify-between ${model.name === selectedModel ? 'bg-primary/5' : ''}`}
                          onSelect={() => setSelectedModel(model.name)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{model.displayName}</span>
                            {model.name === selectedModel && (
                              <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-32">{model.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </h2>
            </div>
          </div>
          
          {/* Scrollable Chat Area (Takes Remaining Space) */}
          <main className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-background/20 hover:scrollbar-thumb-border/70">
            <div className="max-w-5xl mx-auto px-6 pt-6 pb-6"> {/* Added bottom padding */}
              {/* Chat messages */}
              <div 
                ref={chatContainerRef}
                className="space-y-4 rounded-2xl border border-border/40 p-5 bg-card/20 backdrop-blur-sm min-h-[calc(100vh-260px)] overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-background/20 hover:scrollbar-thumb-border/70"
              > 
                {/* Examples and Template Section */}
                {(examples.length > 0 || promptTemplate?.inputs?.length > 0) && (
                  <div className="mb-5 pb-5 border-b border-border/30">
                    
                    {/* Section Title */}
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                      
                        <span className="text-muted-foreground">
                          Sending to the AI:
                        </span>
                      </h3>
                    </div>
                    
                    {/* Examples Display */}
                    {examples.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center mb-2">
                          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                            {examples.length} Example{examples.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {examples.map((example, idx) => {
                            const labels = exampleTypeLabels[example.type];
                            // Truncate long content
                            const truncateText = (text: string, maxLength = 30) => 
                              text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
                            
                            return (
                              <div 
                                key={example.id} 
                                className="bg-primary/5 border border-primary/10 rounded-lg p-2 text-xs flex flex-col"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-primary/80">Example {idx + 1}</span>
                                  <span className="text-[10px] bg-muted/50 px-1 py-0.5 rounded text-muted-foreground">{example.type}</span>
                                </div>
                                <div className="text-muted-foreground mb-1 text-[10px] line-clamp-1">
                                  <span className="font-medium">{labels.first}:</span> {truncateText(example.firstField)}
                                </div>
                                <div className="text-muted-foreground text-[10px] line-clamp-1">
                                  <span className="font-medium">{labels.second}:</span> {truncateText(example.secondField)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Template Display */}
                    {promptTemplate?.inputs?.length > 0 && (
                      <div>
                        <div className="flex items-center mb-2">
                          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                            Prompt Template ({promptTemplate.inputs.length} input{promptTemplate.inputs.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {promptTemplate.inputs.map((input, inputIdx) => (
                            <div 
                              key={input.id} 
                              className="bg-primary/5 border border-primary/10 rounded-lg p-2 text-xs flex flex-col"
                            >
                              <div className="font-medium text-primary/80 mb-1">Input {inputIdx + 1}</div>
                              <div className="space-y-1">
                                {/* Truncate long content */}
                                <div className="text-muted-foreground text-[10px] line-clamp-1 py-0.5">
                                  <span className="font-medium inline-block min-w-[40%] max-w-[60%] truncate">
                                    {input.description}:
                                  </span> 
                                  <span className="opacity-80">
                                    {input.content.length > 30 ? `${input.content.substring(0, 30)}...` : input.content}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Clear Conversation Button (Messages only) */}
                {messages.length > 0 && (
                  <div className="flex justify-end mb-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                        >
                          <Trash2 className="h-[12px] w-[12px]" />
                          Clear messages
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem 
                          onSelect={clearChat}
                          className="text-destructive focus:text-destructive cursor-pointer"
                        >
                          Clear conversation messages only
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="max-w-md">
                      <h3 className="text-lg font-medium mb-4">Start with examples & template</h3>
                      
                      <div className="flex gap-4 justify-center">
                        <div className="flex items-center gap-2 bg-muted/20 px-4 py-3 rounded-lg">
                          <div className="bg-primary rounded-full p-1.5 flex-shrink-0">
                            <SendIcon className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                          <span className="text-sm">Type a message</span>
                        </div>
                        
                        <span className="text-muted-foreground self-center">or</span>
                        
                        <div className="flex items-center gap-2 bg-muted/20 px-4 py-3 rounded-lg">
                          <div className="bg-primary rounded-full p-1.5 flex-shrink-0">
                            <Check className="h-3.5 w-3.5 text-primary-foreground" />
                          </div>
                          <span className="text-sm">Click RUN</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div 
                      key={message.id || index} 
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`group relative max-w-[80%] rounded-2xl m-2 px-5 py-4 ${
                          message.role === 'user' 
                            ? 'bg-primary text-primary-foreground shadow-sm' 
                            : 'bg-secondary text-secondary-foreground shadow-sm backdrop-blur-sm'
                        } transition-all duration-200 hover:shadow-md`}
                      >
                        {/* Action buttons - visible on hover or when editing */}
                        <div className={`absolute -top-6 -right-4 z-10 ${editingMessageIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity flex gap-1.5`}>
                          {editingMessageIndex === index ? (
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              className="h-8 w-8 p-0 bg-zinc-800/90 text-zinc-200 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                              onClick={saveMessageEdit}
                              title="Save changes"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-8 w-8 p-0 bg-zinc-800/80 text-zinc-300 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                                onClick={() => startEditingMessage(index)}
                                title="Edit message"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              {message.role === 'user' && (
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 bg-zinc-800/80 text-zinc-300 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                                  onClick={() => runFromMessage(index)}
                                  title="Run from this message"
                                  disabled={isLoading}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                        
                        {editingMessageIndex === index ? (
                          <div className="flex items-start">
                            <Textarea 
                              value={editingMessageContent}
                              onChange={(e) => setEditingMessageContent(e.target.value)}
                              className="flex-1 p-3 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveMessageEdit();
                                } else if (e.key === 'Escape') {
                                  cancelMessageEdit();
                                }
                              }}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className=" overflow-hidden break-words">
                            {/* Show example indicator for messages that used examples */}
                            {message.activeExampleIds && message.activeExampleIds.length > 0 && (
                              <div 
                                className="mb-2 text-xs text-muted-foreground flex items-center gap-1"
                                title="This message was created with specific examples"
                              >
                                <InfoIcon className="h-[12px] w-[12px]" />
                                <span>Examples included in conversation</span>
                              </div>
                            )}
                            
                            {message.role === 'assistant' ? (
                              <div className="markdown-wrapper p-0">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                                  components={{
                                    pre: ({ children, ...props }) => {
                                      const [copied, setCopied] = useState(false);
                                      const codeRef = useRef<HTMLPreElement>(null);
                                      
                                      const handleCopy = () => {
                                        const code = codeRef.current?.textContent || '';
                                        copy(code);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                      };
                                      
                                      return (
                                        <div className="relative group">
                                          <pre 
                                            ref={codeRef} 
                                            className="markdown-code-block overflow-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-zinc-900/20" 
                                            style={{ 
                                              borderRadius: '0.75rem', 
                                              padding: '0.5rem',
                                              paddingRight: '2rem' 
                                            }} 
                                            {...props}
                                          >
                                            {children}
                                          </pre>
                                          <button
                                            onClick={handleCopy}
                                            className="code-copy-button absolute top-2 right-2 p-1.5 rounded-md transition-opacity duration-200 hover:bg-secondary text-muted-foreground hover:text-foreground"
                                            title="Copy code"
                                            aria-label="Copy code to clipboard"
                                          >
                                            {copied ? (
                                              <CheckCheck size={16} className="text-green-500 check-icon" />
                                            ) : (
                                              <Copy size={16} />
                                            )}
                                          </button>
                                        </div>
                                      );
                                    },
                                    code: ({ className, children, ...props }) => {
                                      const match = /language-(\w+)/.exec(className || '');
                                      return match ? (
                                        <code 
                                          className={`${className || ''}`} 
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      ) : (
                                        <code 
                                          className="bg-background/50 px-1 py-0.5 rounded-sm text-sm" 
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    },
                                    p: ({ children, ...props }) => (
                                      <p className="mb-2 last:mb-0" {...props}>{children}</p>
                                    ),
                                    ul: ({ children, ...props }) => (
                                      <ul className="ml-6 mb-2 list-disc" {...props}>{children}</ul>
                                    ),
                                    ol: ({ children, ...props }) => (
                                      <ol className="ml-6 mb-2 list-decimal" {...props}>{children}</ol>
                                    ),
                                    li: ({ children, ...props }) => (
                                      <li className="mb-1" {...props}>{children}</li>
                                    ),
                                    a: ({ children, ...props }) => (
                                      <a className="text-blue-500 hover:underline" {...props}>{children}</a>
                                    ),
                                    h1: ({ children, ...props }) => (
                                      <h1 className="text-xl font-bold mb-2 mt-4" {...props}>{children}</h1>
                                    ),
                                    h2: ({ children, ...props }) => (
                                      <h2 className="text-lg font-bold mb-2 mt-3" {...props}>{children}</h2>
                                    ),
                                    h3: ({ children, ...props }) => (
                                      <h3 className="text-md font-bold mb-2 mt-3" {...props}>{children}</h3>
                                    ),
                                    table: ({ children, ...props }) => (
                                      <div className="overflow-x-auto my-4">
                                        <table className="border-collapse border border-border" {...props}>{children}</table>
                                      </div>
                                    ),
                                    th: ({ children, ...props }) => (
                                      <th className="border border-border bg-secondary px-4 py-2 text-left" {...props}>{children}</th>
                                    ),
                                    td: ({ children, ...props }) => (
                                      <td className="border border-border px-4 py-2" {...props}>{children}</td>
                                    ),
                                    blockquote: ({ children, ...props }) => (
                                      <blockquote className="pl-4 border-l-4 border-border italic my-2" {...props}>{children}</blockquote>
                                    ),
                                    hr: ({ ...props }) => (
                                      <hr className="my-4 border-border" {...props} />
                                    ),
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div 
                                className="hover:bg-opacity-90 transition-colors"
                              >
                                {message.content}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-secondary text-secondary-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
          
          {/* Input Area (Fixed Height, Bottom) */}
          <div className="flex-shrink-0 z-10 backdrop-blur-xl bg-background/90 border-t border-border/30 py-6 pb-8 sm:pb-6"> 
            <div className="max-w-4xl mx-auto px-6">
              {/* Message Input Area with RUN button */}
              <div className="flex items-start gap-3">
                {/* Message input and send button section */}
                <div className="flex items-start gap-3 flex-1">
                  <div className="flex-1 relative">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      className="w-full resize-none overflow-y-auto bg-background text-foreground rounded-2xl min-h-[60px] max-h-[180px] py-4 px-4 border-border/70 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent shadow-sm transition-all duration-200 ease-in-out hover:shadow-md"
                      style={textareaStyle}
                    />
                  </div>
                  
                  {/* Send Button */}
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={isLoading || !input.trim()} 
                    className="rounded-full h-12 w-12 p-0 flex items-center justify-center flex-shrink-0 shadow-sm hover:shadow transition-all duration-200"
                  >
                    <SendIcon className="h-5 w-5" />
                  </Button>
                </div>
                
                {/* Vertical separator */}
                <div className="h-12 w-px bg-border/50 mx-2 self-center"></div>
                
                {/* RUN Button - Only enabled if there are examples or templates */}
                <Button 
                  onClick={handleRunExamplesAndTemplate} 
                  disabled={isLoading || (examples.length === 0 && (!promptTemplate || promptTemplate.inputs.length === 0))}
                  className="rounded-full h-12 px-5 text-sm font-medium flex-shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
                  title="Run examples and template to get AI response"
                >
                  <span>RUN</span>
                  {(examples.length > 0 || (promptTemplate && promptTemplate.inputs.length > 0)) && (
                    <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                      {examples.length > 0 && promptTemplate && promptTemplate.inputs.length > 0 
                        ? `${examples.length}E + ${promptTemplate.inputs.length}I` 
                        : examples.length > 0 
                          ? `${examples.length}E` 
                          : `${promptTemplate.inputs.length}I`}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div> {/* End Main Content Area */}
    </div>
  )
}

export default App
