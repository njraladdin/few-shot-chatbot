import { useState, useEffect, useRef } from "react"
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

import { SendIcon, RefreshCw, Check, ChevronDown, Copy, CheckCheck, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"
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
import Templates, { Template, TEMPLATES_STORAGE_KEY, createDefaultTemplate, formatTemplateBlocks } from "@/components/Templates"
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

// Simple token counter utility (approximation)
const estimateTokenCount = (text: string): number => {
  // GPT models use about 4 characters per token on average in English text
  return Math.ceil(text.length / 4);
};

// Generate contents array for API request and count tokens
const generateContentsAndCountTokens = (
  messages: Message[], 
  userMessage: Message | null,
  examples: Example[],
  templates: Template[],
  formatTemplateBlocks: (template: Template) => string
): { contents: any[], tokenCount: number } => {
  let totalText = '';
  const contents: any[] = [];
  
  // Build examples section (if any)
  if (examples.length > 0) {
    // Format all examples into a single message
    let examplesText = "";
    
    examples.forEach((example, idx) => {
      const labels = exampleTypeLabels[example.type];
      // Include just the example content with minimal formatting
      examplesText += `${labels.first}:\n${example.firstField}\n\n`;
      examplesText += `${labels.second}:\n${example.secondField}\n\n\n`;
    });
    
    console.log('[Debug] Examples content:', examplesText);
    totalText += examplesText;
    contents.push({ 
      role: 'user' as const, 
      parts: [{ text: examplesText }] 
    });
  }
  
  // Build templates section (if any)
  if (templates.length > 0) {
    // Format all templates into a single message
    let templatesText = "";
    
    templates.forEach((template, idx) => {
      // Include just the formatted template content
      templatesText += formatTemplateBlocks(template) + "\n\n";
    });
    
    console.log('[Debug] Templates content:', templatesText);
    totalText += templatesText;
    contents.push({ 
      role: 'user' as const, 
      parts: [{ text: templatesText }] 
    });
  }
  
  // Build contents for conversation messages
  const conversationMessages = userMessage ? [...messages, userMessage] : messages;
  const conversationContents = conversationMessages.map(msg => {
    totalText += msg.content;
    return {
      role: msg.role === 'assistant' ? 'model' : 'user' as const,
      parts: [{ text: msg.content }]
    };
  });
  
  // Combine all contents
  contents.push(...conversationContents);
  
  // Log the full conversation payload
  console.log('[Debug] Full conversation payload:', {
    examplesCount: examples.length,
    templatesCount: templates.length,
    messagesCount: conversationMessages.length,
    totalTokens: estimateTokenCount(totalText),
    contents
  });
  
  // Estimate token count
  const tokenCount = estimateTokenCount(totalText);
  
  return { contents, tokenCount };
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

function App() {
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
  const [tokenCount, setTokenCount] = useState(0);
  
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
  
  // Model selection state
  const [models, setModels] = useState<Model[]>([]);
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
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  // Sidebar state - now with individual section toggles
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isExamplesOpen, setIsExamplesOpen] = useState(true);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(true);
  
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
  
  // Function to resize textarea
  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  };
  
  // Resize textarea when input changes
  useEffect(() => {
    resizeTextarea();
  }, [input]);
  
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
  
  // Templates for few-shot learning - initialize with data from localStorage if it exists
  const [templates, setTemplates] = useState<Template[]>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
        if (savedTemplates) {
          console.log('Initializing templates from localStorage');
          const parsedTemplates = JSON.parse(savedTemplates);
          
          // Migrate old template format to new format if needed
          const migratedTemplates = parsedTemplates.map((template: any) => {
            // Check if this is an old format template (has blocks instead of inputs)
            if (template.blocks && !template.inputs) {
              console.log('Migrating template from old format');
              return {
                id: template.id,
                inputs: template.blocks.map((block: any) => {
                  // Convert each block to an input
                  return {
                    id: block.id.replace('block', 'input'),
                    description: block.type === 'text' ? 'Description' : 'Input',
                    content: block.content
                  };
                })
              };
            }
            // Return template if it's already in the new format
            return template;
          });
          
          return migratedTemplates;
        }
      } catch (error) {
        console.error("Failed to load templates from localStorage during initialization:", error);
      }
    }
    // Return default template if no templates exist
    return [createDefaultTemplate()];
  });
  
  // For message editing
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  // Save templates to localStorage whenever they change
  useEffect(() => {
    if (isLocalStorageAvailable() && (templates.length > 0 || localStorage.getItem(TEMPLATES_STORAGE_KEY))) {
      try {
        const templatesJSON = JSON.stringify(templates);
        localStorage.setItem(TEMPLATES_STORAGE_KEY, templatesJSON);
        console.log('Templates saved to localStorage:', templates);
      } catch (error) {
        console.error("Failed to save templates to localStorage:", error);
      }
    }
  }, [templates]);
  
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
  
  // Fetch available models from Google API
  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      // Hardcoded models instead of fetching from API
      const hardcodedModels = [
        { name: "gemini-2.5-pro-preview-03-25", displayName: "Gemini 2.5 Pro Preview" },
        { name: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
        { name: "gemini-2.0-flash-thinking-exp-01-21", displayName: "Gemini 2.0 Flash Thinking" },
      ];
      
      console.log('Using hardcoded Gemini models:', hardcodedModels);
      setModels(hardcodedModels);
      
      // If the current selectedModel isn't in the list, select the first one
      if (!hardcodedModels.some((m: Model) => m.name === selectedModel)) {
        setSelectedModel(hardcodedModels[0].name);
      }
    } catch (error) {
      console.error("Error setting models:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };
  
  // Initialize models on component mount
  useEffect(() => {
    fetchModels();
  }, []);
  
  // Update token count when input or examples/templates change
  useEffect(() => {
    if (input.trim()) {
      let userMessage: Message = { role: 'user', content: input };
      
      const { tokenCount } = generateContentsAndCountTokens(
        messages,
        userMessage,
        examples, // Use all examples
        templates,
        formatTemplateBlocks
      );
      setTokenCount(tokenCount);
    } else {
      // Always calculate tokens for the conversation, examples, and templates
      // Even when input is empty
      const { tokenCount } = generateContentsAndCountTokens(
        messages,
        null,
        examples, // Use all examples
        templates,
        formatTemplateBlocks
      );
      setTokenCount(tokenCount);
    }
  }, [input, messages, examples, templates]);
  
  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  
  // Calculate initial token count on component mount
  useEffect(() => {
    const { tokenCount } = generateContentsAndCountTokens(
      messages,
      null,
      examples, // Use all examples
      templates,
      formatTemplateBlocks
    );
    setTokenCount(tokenCount);
  }, []);
  
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
    
    // Add user message to chat
    const userMessage: Message = { 
      role: 'user', 
      content: input,
      id: `user-${Date.now()}`
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Reset input
    setInput("");
    
    setIsLoading(true);
    
    // Scroll to bottom immediately when sending a message
    scrollToBottom(false);
    
    try {
      // Use the utility function to generate contents and count tokens
      const { contents, tokenCount } = generateContentsAndCountTokens(
        messages, 
        userMessage, 
        examples, // Use all examples
        templates, 
        formatTemplateBlocks
      );
      
      // Update token count in state
      setTokenCount(tokenCount);
      
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
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Sorry, there was an error processing your request.",
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
    
    // Recalculate token count after clearing chat
    const { tokenCount } = generateContentsAndCountTokens(
      [],
      null,
      examples, // Use all examples
      templates,
      formatTemplateBlocks
    );
    setTokenCount(tokenCount);
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
        // Use the utility function to generate contents and count tokens
        const { contents, tokenCount } = generateContentsAndCountTokens(
          truncatedMessages,
          null,
          examples, // Use all examples
          templates,
          formatTemplateBlocks
        );
        
        // Update token count in state
        setTokenCount(tokenCount);
        
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
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Sorry, there was an error processing your request.",
          id: `error-${Date.now()}`
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Add a new function to run examples and templates without a user message
  const handleRunExamplesAndTemplates = async () => {
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
      
      // Scroll to bottom immediately when running examples/templates
      scrollToBottom(false);
      
      // Use the utility function to generate contents and count tokens
      const { contents, tokenCount } = generateContentsAndCountTokens(
        messages,
        systemMessage,
        examples,
        templates,
        formatTemplateBlocks
      );
      
      // Update token count in state
      setTokenCount(tokenCount);
      
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
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Sorry, there was an error processing your request.",
        id: `error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

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
              title={isSidebarOpen ? "Hide examples & templates" : "Show examples & templates"}
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2 rounded-full bg-primary/10 p-1">
                  <path d="M9 2H15C20 2 22 4 22 9V15C22 20 20 22 15 22H9C4 22 2 20 2 15V9C2 4 4 2 9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8.5 12H15.5" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 15.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
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
        {/* Sidebar with side-by-side Examples and Templates sections */}
        <div className={`flex-shrink-0 border-r border-border/30 transition-all duration-300 ${
          isSidebarOpen 
            ? (isExamplesOpen && isTemplatesOpen) 
                ? 'w-[40%] max-w-[1000px]' // Full width when both are open
                : (isExamplesOpen || isTemplatesOpen)
                    ? 'w-[30%] max-w-[800px]' // 30% width when only one is open
                    : 'w-[300px]' // Width for both collapsed sections with titles (150px + 150px)
            : 'w-0 overflow-hidden'
        }`}>
          {/* Vertical split layout for Examples and Templates */}
          <div className="flex h-full bg-background/50">
            {/* Examples Section - Left side */}
            <div className={`flex flex-col h-full border-r border-border/40 transition-all duration-300 ${
              !isExamplesOpen
                ? 'w-[150px]' // Increased width for collapsed state
                : !isTemplatesOpen
                  ? 'w-[calc(100%-150px)]' // When templates are collapsed, examples take most space
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
                      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.84182 3.13514C9.04327 3.32401 9.05348 3.64042 8.86462 3.84188L5.43521 7.49991L8.86462 11.1579C9.05348 11.3594 9.04327 11.6758 8.84182 11.8647C8.64036 12.0535 8.32394 12.0433 8.13508 11.8419L4.38508 7.84188C4.20477 7.64955 4.20477 7.35027 4.38508 7.15794L8.13508 3.15794C8.32394 2.95648 8.64036 2.94628 8.84182 3.13514Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center h-5 w-5 text-muted-foreground bg-transparent flex-shrink-0 ">
                      <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                      </svg>
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
            
            {/* Templates Section - Right side */}
            <div className={`flex flex-col h-full transition-all duration-300 ${
              !isTemplatesOpen
                ? 'w-[150px]' // Increased width for collapsed state
                : !isExamplesOpen
                  ? 'w-[calc(100%-150px)]' // When examples are collapsed, templates take most space
                  : 'w-1/2' // Equal split when both are open
            }`}>
              {/* Templates Header - Now entire header is clickable */}
              <div 
                className="h-12 border-b border-border/30 flex items-center bg-card/40 cursor-pointer transition-colors hover:bg-card/80"
                onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                title={isTemplatesOpen ? "Collapse templates" : "Expand templates"}
              >
                <div className={`flex items-center justify-between w-full ${isTemplatesOpen ? 'px-3' : 'px-4'}`}>
                  <h3 className="text-sm font-medium flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                    <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Templates</span>
                    {templates.length > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0 rounded-full flex-shrink-0 min-w-[18px] text-center">
                        {templates.length}
                      </span>
                    )}
                  </h3>
                  
                  {/* Direction indicator - shown as compact version when collapsed */}
                  {isTemplatesOpen ? (
                    <div className="flex justify-center items-center h-7 w-7 text-muted-foreground flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.84182 3.13514C9.04327 3.32401 9.05348 3.64042 8.86462 3.84188L5.43521 7.49991L8.86462 11.1579C9.05348 11.3594 9.04327 11.6758 8.84182 11.8647C8.64036 12.0535 8.32394 12.0433 8.13508 11.8419L4.38508 7.84188C4.20477 7.64955 4.20477 7.35027 4.38508 7.15794L8.13508 3.15794C8.32394 2.95648 8.64036 2.94628 8.84182 3.13514Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                      </svg>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center h-5 w-5 text-muted-foreground bg-transparent flex-shrink-0 ">
                      <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Templates Content */}
              {isTemplatesOpen && (
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-background/20 hover:scrollbar-thumb-border/70 p-4 pb-6">
                  <Templates 
                    templates={templates}
                    setTemplates={setTemplates as React.Dispatch<React.SetStateAction<Template[]>>}
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
                  {/* Token count display */}
                  <div 
                    className="text-xs text-muted-foreground bg-background/70 px-3 py-1 rounded-full border border-border/20 shadow-sm hover:bg-background cursor-pointer group transition-colors duration-200 flex items-center gap-2"
                    title="Estimated token count"
                  >
                    <div className="flex items-center gap-1.5">
                      <svg width="10" height="10" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2.5 4C2.5 3.72386 2.72386 3.5 3 3.5H12C12.2761 3.5 12.5 3.72386 12.5 4C12.5 4.27614 12.2761 4.5 12 4.5H3C2.72386 4.5 2.5 4.27614 2.5 4ZM2.5 8C2.5 7.72386 2.72386 7.5 3 7.5H12C12.2761 7.5 12.5 7.72386 12.5 8C12.5 8.27614 12.2761 8.5 12 8.5H3C2.72386 8.5 2.5 8.27614 2.5 8ZM2.5 12C2.5 11.7239 2.72386 11.5 3 11.5H12C12.2761 11.5 12.5 11.7239 12.5 12C12.5 12.2761 12.2761 12.5 12 12.5H3C2.72386 12.5 2.5 12.2761 2.5 12Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                      </svg>
                      ~{tokenCount.toLocaleString()} tokens
                    </div>
                    
                    {/* Tooltip */}
                    <div className="hidden group-hover:block absolute top-full left-0 mt-2 w-56 bg-background/95 border border-border/40 shadow-lg rounded-lg p-2 text-xs z-10">
                      <p className="font-medium mb-1">Token Estimate:</p>
                      <p className="mb-1">• {examples.length} Examples</p>
                      <p className="mb-1">• {templates.length} Templates</p>
                      <p className="mb-1">• Conversation history</p>
                      {input.trim() && <p className="mb-1">• Current message</p>}
                      <div className="mt-2 pt-1 border-t border-border/50">
                        <p className="text-[10px] font-medium">Based on ~4 chars per token</p>
                      </div>
                    </div>
                  </div>

                  {/* Model selector dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs flex items-center gap-1.5 bg-background/70 text-muted-foreground h-7 px-3 border-border/20 shadow-sm hover:bg-background"
                      >
                        <svg width="10" height="10" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                          <path d="M7.28856 0.796908C7.42258 0.734364 7.57742 0.734364 7.71144 0.796908L13.7114 3.59691C13.8875 3.67906 14 3.85574 14 4.05V10.95C14 11.1443 13.8875 11.3209 13.7114 11.4031L7.71144 14.2031C7.57742 14.2656 7.42258 14.2656 7.28856 14.2031L1.28856 11.4031C1.11252 11.3209 1 11.1443 1 10.95V4.05C1 3.85574 1.11252 3.67906 1.28856 3.59691L7.28856 0.796908ZM2 4.80578L7 6.93078V12.9649L2 10.8399V4.80578ZM8 12.9649L13 10.8399V4.80578L8 6.93078V12.9649ZM7.5 6.05672L12.2678 4.02866L7.5 1.80578L2.73221 4.02866L7.5 6.05672Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                        </svg>
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
                {/* Examples and Templates Section */}
                {(examples.length > 0 || templates.length > 0) && (
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
                    
                    {/* Templates Display */}
                    {templates.length > 0 && (
                      <div>
                        <div className="flex items-center mb-2">
                          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                            {templates.length} Template{templates.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {templates.map((template, idx) => (
                            <div 
                              key={template.id} 
                              className="bg-primary/5 border border-primary/10 rounded-lg p-2 text-xs flex flex-col"
                            >
                              <div className="font-medium text-primary/80 mb-1">Template {idx + 1}</div>
                              <div className="space-y-1">
                                {template.inputs.map((input, inputIdx) => {
                                  // Truncate long content
                                  const truncateText = (text: string, maxLength = 30) => 
                                    text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
                                  
                                  return (
                                    <div key={input.id} className="text-muted-foreground text-[10px] line-clamp-1 py-0.5">
                                      <span className="font-medium inline-block min-w-[40%] max-w-[60%] truncate">
                                        {input.description}:
                                      </span> 
                                      <span className="opacity-80">{truncateText(input.content)}</span>
                                    </div>
                                  );
                                })}
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
                          <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H3.5C3.22386 4 3 3.77614 3 3.5ZM5.5 5.5C5.5 5.22386 5.72386 5 6 5C6.27614 5 6.5 5.22386 6.5 5.5V12.5C6.5 12.7761 6.27614 13 6 13C5.72386 13 5.5 12.7761 5.5 12.5V5.5ZM8.5 5.5C8.5 5.22386 8.72386 5 9 5C9.27614 5 9.5 5.22386 9.5 5.5V12.5C9.5 12.7761 9.27614 13 9 13C8.72386 13 8.5 12.7761 8.5 12.5V5.5ZM2.5 5C2.77614 5 3 5.22386 3 5.5V13.5C3 13.7761 3.22386 14 3.5 14H11.5C11.7761 14 12 13.7761 12 13.5V5.5C12 5.22386 12.2239 5 12.5 5C12.7761 5 13 5.22386 13 5.5V13.5C13 14.3284 12.3284 15 11.5 15H3.5C2.67157 15 2 14.3284 2 13.5V5.5C2 5.22386 2.22386 5 2.5 5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                          </svg>
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
                      <h3 className="text-lg font-medium mb-4">Start with examples & templates</h3>
                      
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
                            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
                              <path d="M3.5 8.5L7 12L13 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
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
                                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5">
                                  <path d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                                </svg>
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
                                  <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5">
                                    <path d="M3.24182 2.32181C3.3919 2.23132 3.5784 2.22601 3.73338 2.30781L12.7334 7.05781C12.8974 7.14436 13 7.31457 13 7.5C13 7.68543 12.8974 7.85564 12.7334 7.94219L3.73338 12.6922C3.5784 12.774 3.3919 12.7687 3.24182 12.6782C3.09175 12.5877 3 12.4252 3 12.25V2.75C3 2.57476 3.09175 2.4123 3.24182 2.32181ZM4 3.57925V11.4207L11.4338 7.5L4 3.57925Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                                  </svg>
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
                                <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M7.5 2C4.4624 2 2 4.4624 2 7.5C2 10.5376 4.4624 13 7.5 13C10.5376 13 13 10.5376 13 7.5C13 4.4624 10.5376 2 7.5 2ZM1 7.5C1 3.91015 3.91015 1 7.5 1C11.0899 1 14 3.91015 14 7.5C14 11.0899 11.0899 14 7.5 14C3.91015 14 1 11.0899 1 7.5ZM7 4.5C7 4.22386 7.22386 4 7.5 4C7.77614 4 8 4.22386 8 4.5V8.5C8 8.77614 7.77614 9 7.5 9C7.22386 9 7 8.77614 7 8.5V4.5ZM7 10.5C7 10.2239 7.22386 10 7.5 10C7.77614 10 8 10.2239 8 10.5C8 10.7761 7.77614 11 7.5 11C7.22386 11 7 10.7761 7 10.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                                </svg>
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
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type your message..."
                      className="w-full resize-none overflow-y-auto bg-background text-foreground rounded-2xl min-h-[60px] max-h-[180px] py-4 px-4 border-border/70 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent shadow-sm transition-all duration-200 ease-in-out hover:shadow-md"
                      style={{ 
                        height: textareaRef.current?.scrollHeight 
                          ? `${Math.min(textareaRef.current.scrollHeight, 180)}px` 
                          : '60px' 
                      }}
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
                  onClick={handleRunExamplesAndTemplates} 
                  disabled={isLoading || (examples.length === 0 && templates.length === 0)}
                  className="rounded-full h-12 px-5 text-sm font-medium flex-shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-2"
                  title="Run examples and templates to get AI response"
                >
                  <span>RUN</span>
                  {(examples.length > 0 || templates.length > 0) && (
                    <span className="text-xs bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                      {examples.length > 0 && templates.length > 0 
                        ? `${examples.length}E + ${templates.length}T` 
                        : examples.length > 0 
                          ? `${examples.length}E` 
                          : `${templates.length}T`}
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
