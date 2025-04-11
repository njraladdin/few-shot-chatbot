import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
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
import PromptTemplate, { PromptTemplateType } from "@/components/PromptTemplate"
import Examples, { Example, exampleTypeLabels } from "@/components/Examples"

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

// Available models
export const MODELS: Model[] = [
  { name: "gemini-2.5-pro-preview-03-25", displayName: "Gemini 2.5 Pro Preview" },
  { name: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
  { name: "gemini-2.0-flash-thinking-exp-01-21", displayName: "Gemini 2.0 Flash Thinking" },
];

// Local storage keys
export const MESSAGES_STORAGE_KEY = 'few-shot-chatbot-messages';
export const SELECTED_MODEL_STORAGE_KEY = 'few-shot-chatbot-selected-model';
export const API_KEY_STORAGE_KEY = 'few-shot-chatbot-api-key';
export const PROMPT_TEMPLATE_STORAGE_KEY = 'few-shot-chatbot-prompt-template';
export const EXAMPLES_STORAGE_KEY = 'few-shot-chatbot-examples';

// Create a default template function
const createDefaultTemplate = (): PromptTemplateType => {
  return {
    id: `template-default-${Date.now()}`,
    inputs: [
      {
        id: `text-${Date.now()}`,
        type: "text",
        content: ""
      },
      {
        id: `input-${Date.now() + 1}`,
        type: "input",
        content: ""
      }
    ]
  };
};

// Debug logger function to standardize console logging format
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${message}`, data ? data : '');
};

// Performance logger function to track function execution time
const logPerformance = (functionName: string, startTime: number) => {
  const duration = performance.now() - startTime;
  console.log(`[PERF] ${functionName} took ${duration.toFixed(2)}ms to execute`);
};

// Function to format prompt template for API
const formatPromptTemplate = (template: PromptTemplateType): string => {
  return template.inputs.map(input => {
    // Just return the content regardless of type
    return input.content;
  }).join('\n\n');
};

// Function to format examples for API
const formatExamples = (examples: Example[]): string => {
  let examplesText = "";
  examples.forEach((example) => {
    const labels = exampleTypeLabels[example.type];
    examplesText += `${labels.first}:\n${example.firstField}\n\n`;
    examplesText += `${labels.second}:\n${example.secondField}\n\n\n`;
  });
  return examplesText;
};

// Function to generate API payload with examples and template
const generateApiContents = (examples: Example[], promptTemplate: PromptTemplateType): any[] => {
  const contents: any[] = [];
  
  // Format and add examples if any exist
  if (examples.length > 0) {
    const formattedExamples = formatExamples(examples);
    if (formattedExamples) {
      contents.push({
        role: 'user' as const,
        parts: [{ text: formattedExamples }]
      });
    }
  }
  
  // Format and add template if it has inputs
  if (promptTemplate?.inputs?.length > 0) {
    const formattedTemplate = formatPromptTemplate(promptTemplate);
    if (formattedTemplate) {
      contents.push({
        role: 'user' as const,
        parts: [{ text: formattedTemplate }]
      });
    }
  }
  
  return contents;
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
  const renderCount = useRef(0);
  const lastRenderTime = useRef(performance.now());

  renderCount.current++;

  useEffect(() => {
    const now = performance.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    console.log(`[RENDER] ${componentName} rendered #${renderCount.current} (${timeSinceLastRender.toFixed(2)}ms since last render)`);
    lastRenderTime.current = now;
  });
}

// Memoized chat message component
const ChatMessage = memo(({ 
  message, 
  index, 
  editingMessageIndex, 
  editingMessageContent, 
  setEditingMessageContent,
  startEditingMessage, 
  saveMessageEdit, 
  cancelMessageEdit, 
  runFromMessage, 
  isLoading 
}: { 
  message: Message;
  index: number;
  editingMessageIndex: number | null;
  editingMessageContent: string;
  setEditingMessageContent: (content: string) => void;
  startEditingMessage: (index: number) => void;
  saveMessageEdit: () => void;
  cancelMessageEdit: () => void;
  runFromMessage: (index: number) => void;
  isLoading: boolean;
}) => {
  // For logging render performance
  const renderTime = useRef(performance.now());
  useEffect(() => {
    const duration = performance.now() - renderTime.current;
    console.log(`[PERF] ChatMessage ${index} (${message.role}) rendered in ${duration.toFixed(2)}ms`);
    renderTime.current = performance.now();
  });

  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`group relative max-w-[80%] rounded-2xl m-2 px-5 py-4 ${message.role === 'user'
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
          <div className="overflow-hidden break-words">
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
                <MarkdownContent content={message.content} />
              </div>
            ) : (
              <div className="hover:bg-opacity-90 transition-colors">
                {message.content}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Return true if we DON'T need to re-render
  // Check if important props haven't changed
  const isEditing = prevProps.editingMessageIndex === prevProps.index;
  const willBeEditing = nextProps.editingMessageIndex === nextProps.index;
  
  // If editing state changed, we must re-render
  if (isEditing !== willBeEditing) {
    return false;
  }
  
  // If editing this message, check if content changed
  if (isEditing && willBeEditing && prevProps.editingMessageContent !== nextProps.editingMessageContent) {
    return false;
  }
  
  // Always re-render if message ID or content changed
  if (prevProps.message.id !== nextProps.message.id || 
      prevProps.message.content !== nextProps.message.content) {
    return false;
  }
  
  // Re-render if loading state changes (affects run button)
  if (prevProps.isLoading !== nextProps.isLoading && prevProps.message.role === 'user') {
    return false;
  }
  
  // Don't re-render otherwise
  return true;
});

// Further memoize the Markdown component to avoid unnecessary re-renders
const MarkdownContent = memo(({ content }: { content: string }) => {
  const renderTime = useRef(performance.now());
  const [copied, setCopied] = useState(false);
  console.log('MarkdownContent rendered');
  useEffect(() => {
    const duration = performance.now() - renderTime.current;
    console.log(`[PERF] Markdown rendered in ${duration.toFixed(2)}ms`);
    renderTime.current = performance.now();
  });
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize, rehypeHighlight]}
      components={{
        pre: ({ children, ...props }) => {
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
      {content}
    </ReactMarkdown>
  );
});

function App() {
  // Performance tracking for the App component
  useRenderCount('App');
  const renderStartTime = useRef(performance.now());

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    console.log(`App render completed in ${renderTime.toFixed(2)}ms`);
    renderStartTime.current = performance.now();
  });

  // State for tracking if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // State for copy prompt feedback
  const [promptCopied, setPromptCopied] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => {
    debugLog('Initializing messages state');
    if (isLocalStorageAvailable()) {
      try {
        const savedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
        if (savedMessages) {
          const parsedMessages = JSON.parse(savedMessages);
          debugLog(`Loaded ${parsedMessages.length} messages from localStorage`);
          return parsedMessages;
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
    debugLog('saveApiKey called');
    setApiKey(key);
    if (isLocalStorageAvailable()) {
      try {
        localStorage.setItem(API_KEY_STORAGE_KEY, key);
        debugLog('API key saved to localStorage');
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


  // Add ref for chat container to enable auto-scrolling
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Function to smoothly scroll to bottom of chat
  const scrollToBottom = (smooth = true) => {
    debugLog(`scrollToBottom called (smooth: ${smooth})`);
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
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplateType>(() => {
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

  // Track changes in state to mark unsaved changes
  useEffect(() => {
    if (messages.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [messages]);

  useEffect(() => {
    if (examples.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [examples]);

  useEffect(() => {
    if (promptTemplate?.inputs?.length > 0) {
      setHasUnsavedChanges(true);
    }
  }, [promptTemplate]);

  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [selectedModel]);

  // Function to save all data to localStorage
  const saveProjectToLocalStorage = () => {
    debugLog('saveProjectToLocalStorage called');
    if (isLocalStorageAvailable()) {
      try {
        // Save messages
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
        
        // Save examples
        localStorage.setItem(EXAMPLES_STORAGE_KEY, JSON.stringify(examples));
        
        // Save prompt template
        localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(promptTemplate));
        
        // Save selected model
        localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel);
        
        // Reset unsaved changes flag
        setHasUnsavedChanges(false);
        
        debugLog('Project saved to localStorage successfully');
      } catch (error) {
        console.error("Failed to save project to localStorage:", error);
      }
    }
  };

  // Add tracking for input changes
  useEffect(() => {
    console.log(`Input changed to length: ${input.length}`);
  }, [input]);

  // Generate API payload only when actually needed (not on every keystroke)
  const generateApiPayload = useCallback((
    currentMessages: Message[],
    additionalMessage: Message | null = null
  ) => {
    const start = performance.now();
    debugLog('generateApiPayload called', {
      currentMessagesCount: currentMessages.length,
      hasAdditionalMessage: !!additionalMessage
    });

    // Get formatted examples and template content
    const examplesAndTemplateContents = generateApiContents(examples, promptTemplate);
    
    // Combine with conversation messages
    const contents = [...examplesAndTemplateContents];

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
    debugLog('Payload info:', {
      examplesCount: examples.length,
      hasPromptTemplate: !!promptTemplate?.inputs?.length,
      messagesCount: conversationMessages.length,
      totalContentItems: contents.length
    });

    logPerformance('generateApiPayload', start);
    return contents;
  }, [examples, promptTemplate]);

  // Optimized handleSendMessage function
  const handleSendMessage = async () => {
    const start = performance.now();
    debugLog('handleSendMessage called');

    // Require input text
    if (!input.trim()) {
      debugLog('handleSendMessage - empty input, returning');
      return;
    }

    // Check if API key is set
    if (!apiKey) {
      debugLog('handleSendMessage - no API key, opening config dialog');
      setIsConfigDialogOpen(true);
      return;
    }

    // Create user message
    const userMessage: Message = {
      role: 'user',
      content: input,
      id: `user-${Date.now()}`
    };

    debugLog('handleSendMessage - adding user message', { messageId: userMessage.id });

    // Add user message to chat
    setMessages(prev => [...prev, userMessage]);

    // Reset input
    setInput("");

    setIsLoading(true);

    // Scroll to bottom immediately when sending a message
    scrollToBottom(false);

    try {
      debugLog('handleSendMessage - preparing API call');
      // Generate API payload only when needed
      const contents = generateApiPayload(messages, userMessage);

      debugLog('handleSendMessage - sending API request', { model: selectedModel });

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

      debugLog('handleSendMessage - API request sent', {
        model: selectedModel,
        messageCount: contents.length,
        requestSize: JSON.stringify({ contents }).length,
        timestamp: new Date().toISOString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        debugLog('handleSendMessage - API error', { status: response.status, errorText });
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      debugLog('handleSendMessage - API response received', {
        status: response.status,
        hasContent: !!result.candidates?.[0]?.content?.parts?.[0]?.text
      });

      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

      // Add AI response to chat
      const assistantMessage = {
        role: 'assistant' as const,
        content: aiResponse,
        id: `assistant-${Date.now()}`
      };

      debugLog('handleSendMessage - adding assistant response', {
        messageId: assistantMessage.id,
        contentLength: aiResponse.length
      });

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      // Extract the error message - show the specific error instead of a generic message
      const errorMessage = error instanceof Error
        ? `Error: ${error.message}`
        : "Unknown error occurred";

      debugLog('handleSendMessage - error occurred', { errorMessage });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to get response from Gemini API. ${errorMessage}`,
        id: `error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
      logPerformance('handleSendMessage', start);
    }
  };

  const clearChat = () => {
    debugLog('clearChat called');
    setMessages([]);
    setHasUnsavedChanges(true);
  };

  // Functions for editing messages
  const startEditingMessage = (index: number) => {
    debugLog('startEditingMessage called', { index });
    setEditingMessageIndex(index);
    setEditingMessageContent(messages[index].content);
  };

  const saveMessageEdit = () => {
    debugLog('saveMessageEdit called', { editingMessageIndex });
    if (editingMessageIndex !== null && editingMessageContent.trim()) {
      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = {
        ...updatedMessages[editingMessageIndex],
        content: editingMessageContent
      };
      debugLog('saveMessageEdit - updating message', {
        messageId: updatedMessages[editingMessageIndex].id,
        newContentLength: editingMessageContent.length
      });
      setMessages(updatedMessages);
      setEditingMessageIndex(null);
    }
  };

  const cancelMessageEdit = () => {
    debugLog('cancelMessageEdit called');
    setEditingMessageIndex(null);
  };
  
  // Handler for editing message content
  const handleEditingMessageContent = useCallback((newContent: string) => {
    debugLog('handleEditingMessageContent called', { newContent: newContent.length });
    setEditingMessageContent(newContent);
  }, []);

  // Run conversation from a specific message
  const runFromMessage = async (index: number) => {
    const start = performance.now();
    debugLog('runFromMessage called', { index });

    // Check if API key is set
    if (!apiKey) {
      debugLog('runFromMessage - no API key, opening config dialog');
      setIsConfigDialogOpen(true);
      return;
    }

    // Keep messages up to and including the selected index
    const truncatedMessages = messages.slice(0, index + 1);
    debugLog('runFromMessage - truncating messages', {
      originalCount: messages.length,
      newCount: truncatedMessages.length
    });

    setMessages(truncatedMessages);

    const selectedMessage = messages[index];

    if (selectedMessage.role === 'user') {
      setIsLoading(true);

      try {
        debugLog('runFromMessage - preparing API call');
        // Generate API payload only when needed (using truncated messages)
        const contents = generateApiPayload(truncatedMessages);

        debugLog('runFromMessage - sending API request', { model: selectedModel });

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

        debugLog('runFromMessage - API request sent', {
          model: selectedModel,
          messageCount: contents.length,
          requestSize: JSON.stringify({ contents }).length,
          timestamp: new Date().toISOString()
        });

        if (!response.ok) {
          const errorText = await response.text();
          debugLog('runFromMessage - API error', { status: response.status, errorText });
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        debugLog('runFromMessage - API response received', {
          status: response.status,
          hasContent: !!result.candidates?.[0]?.content?.parts?.[0]?.text
        });

        const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

        // Add AI response to chat without active examples
        const assistantMessage = {
          role: 'assistant' as const,
          content: aiResponse,
          id: `assistant-${Date.now()}`
        };

        debugLog('runFromMessage - adding assistant response', {
          messageId: assistantMessage.id,
          contentLength: aiResponse.length
        });

        setMessages(prev => [...prev, assistantMessage]);
      } catch (error) {
        console.error("Error calling Gemini API:", error);
        // Extract the error message - show the specific error instead of a generic message
        const errorMessage = error instanceof Error
          ? `Error: ${error.message}`
          : "Unknown error occurred";

        debugLog('runFromMessage - error occurred', { errorMessage });

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Failed to get response from Gemini API. ${errorMessage}`,
          id: `error-${Date.now()}`
        }]);
      } finally {
        setIsLoading(false);
        logPerformance('runFromMessage', start);
      }
    }
  };

  // Add a new function to run examples and template without a user message
  const handleRunExamplesAndTemplate = async () => {
    const start = performance.now();
    debugLog('handleRunExamplesAndTemplate called');

    // Check if API key is set
    if (!apiKey) {
      debugLog('handleRunExamplesAndTemplate - no API key, opening config dialog');
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

      debugLog('handleRunExamplesAndTemplate - adding system message', { messageId: systemMessage.id });

      // Add the system message to chat
      setMessages(prev => [...prev, systemMessage]);

      // Scroll to bottom immediately when running examples/template
      scrollToBottom(false);

      debugLog('handleRunExamplesAndTemplate - preparing API call');
      // Generate API payload only when needed
      const contents = generateApiPayload(messages, systemMessage);

      debugLog('handleRunExamplesAndTemplate - sending API request', { model: selectedModel });

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

      debugLog('handleRunExamplesAndTemplate - API request sent', {
        model: selectedModel,
        messageCount: contents.length,
        requestSize: JSON.stringify({ contents }).length,
        timestamp: new Date().toISOString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        debugLog('handleRunExamplesAndTemplate - API error', { status: response.status, errorText });
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      debugLog('handleRunExamplesAndTemplate - API response received', {
        status: response.status,
        hasContent: !!result.candidates?.[0]?.content?.parts?.[0]?.text
      });

      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

      // Add AI response to chat
      const assistantMessage = {
        role: 'assistant' as const,
        content: aiResponse,
        id: `assistant-${Date.now()}`
      };

      debugLog('handleRunExamplesAndTemplate - adding assistant response', {
        messageId: assistantMessage.id,
        contentLength: aiResponse.length
      });

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      // Extract the error message - show the specific error instead of a generic message
      const errorMessage = error instanceof Error
        ? `Error: ${error.message}`
        : "Unknown error occurred";

      debugLog('handleRunExamplesAndTemplate - error occurred', { errorMessage });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to get response from Gemini API. ${errorMessage}`,
        id: `error-${Date.now()}`
      }]);
    } finally {
      setIsLoading(false);
      logPerformance('handleRunExamplesAndTemplate', start);
    }
  };

  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
    debugLog('Dark mode enabled');
  }, []);

  // Simple input handler with no resizing logic
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Just update the input value directly - no calculations or side effects
    setInput(e.target.value);
  }, []);
  
  // Simple key handler - just for Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Function to format and copy entire prompt (examples + template)
  const copyFormattedPrompt = useCallback(() => {
    debugLog('copyFormattedPrompt called');
    
    // Helper function to clean text by removing consecutive spaces and line breaks
    const cleanText = (text: string): string => {
      return text
        .replace(/\s+/g, ' ')      // Replace multiple whitespace with single space
        .replace(/\n\s*\n+/g, '\n') // Replace multiple blank lines with one line break
        .trim();                    // Remove leading/trailing whitespace
    };
    
    let promptText = "";
    
    // Add examples if they exist
    if (examples.length > 0) {
      promptText += "# Examples\n";
      // Create more compact examples format
      examples.forEach((example) => {
        const labels = exampleTypeLabels[example.type];
        promptText += `${labels.first}: ${cleanText(example.firstField)}\n`;
        promptText += `${labels.second}: ${cleanText(example.secondField)}\n`;
      });
    }
    
    // Add template if it exists
    if (promptTemplate?.inputs?.length > 0) {
      if (promptText) promptText += "\n";
      promptText += "# Prompt Template\n";
      // Join template inputs with minimal spacing
      promptText += promptTemplate.inputs
        .map(input => cleanText(input.content))
        .filter(content => content) // Remove empty inputs
        .join("\n");
    }
    
    // Final cleanup to ensure the entire text is optimized
    promptText = promptText
      .replace(/\n{3,}/g, '\n\n') // Limit maximum consecutive line breaks to 2
      .trim();
    
    if (promptText) {
      copy(promptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
      debugLog('Ultra compact prompt copied to clipboard', { 
        examplesCount: examples.length, 
        templateInputsCount: promptTemplate?.inputs?.length || 0,
        totalLength: promptText.length
      });
    }
  }, [examples, promptTemplate]);

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
            
            {/* Right actions group */}
            <div className="flex items-center gap-2">
              {/* Save Project Button with indicator */}
              <Button
                variant="outline"
                size="sm"
                onClick={saveProjectToLocalStorage}
                disabled={!hasUnsavedChanges}
                className={`relative text-xs flex items-center gap-1.5 bg-background/70 h-7 px-3 
                  ${hasUnsavedChanges 
                    ? 'text-foreground border-primary/30' 
                    : 'text-muted-foreground border-border/20'
                  }`}
                title="Save project to localStorage"
              >
                <span>Save Project</span>
                {hasUnsavedChanges && (
                  <div className="absolute top-0 right-0 h-2 w-2 rounded-full bg-primary translate-x-1/2 -translate-y-1/2"></div>
                )}
              </Button>

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
                    }}>Save API Key</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area with Sidebar and Conversation */}
      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar with side-by-side Examples and Template sections */}
        <div className={`flex-shrink-0 border-r border-border/30 transition-all duration-300 ${isSidebarOpen
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
            <div className={`flex flex-col h-full border-r border-border/40 transition-all duration-300 ${!isExamplesOpen
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
                    setActiveExampleIds={() => { }}
                    showExampleManager={false}
                    setShowExampleManager={() => { }}
                  />
                </div>
              )}
            </div>

            {/* Template Section - Right side */}
            <div className={`flex flex-col h-full transition-all duration-300 ${!isTemplateOpen
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
                  <PromptTemplate
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
                          {MODELS.find((m: Model) => m.name === selectedModel)?.displayName || selectedModel}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-70 flex-shrink-0 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {MODELS.map((model) => (
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
                      
                      {/* Copy All Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyFormattedPrompt}
                        className="text-xs flex items-center gap-1.5 h-7 px-3 bg-background/70 hover:bg-background border-border/20"
                        title="Copy formatted examples and template for use in other chatbots"
                      >
                        {promptCopied ? (
                          <>
                            <CheckCheck className="h-3 w-3" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy All</span>
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Examples Display */}
                    {examples.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center mb-2">
                          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                            Examples
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
                            Prompt Template
                          </span>
                        </div>
                        <div className="bg-primary/5 border border-primary/10 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-primary/80">Template</span>
                          </div>
                          {promptTemplate.inputs.map((input, idx) => (
                            <div key={input.id} className="text-muted-foreground mb-1.5 last:mb-0 text-[10px] line-clamp-1">
                              <span className="font-medium">
                                {input.type === 'input' ? 'Variable' : 'Text'} {idx + 1}:
                              </span>{' '}
                              {input.content.length > 40
                                ? `${input.content.substring(0, 40)}...`
                                : input.content || `<empty ${input.type}>`}
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
                          Clear conversation messages (unsaved)
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
                  // Memoized conversation messages - only re-render when messages change
                  messages.map((message, index) => (
                    <ChatMessage
                      key={message.id || index}
                      message={message}
                      index={index}
                      editingMessageIndex={editingMessageIndex}
                      editingMessageContent={editingMessageContent}
                      setEditingMessageContent={handleEditingMessageContent}
                      startEditingMessage={startEditingMessage}
                      saveMessageEdit={saveMessageEdit}
                      cancelMessageEdit={cancelMessageEdit}
                      runFromMessage={runFromMessage}
                      isLoading={isLoading}
                    />
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
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      className="w-full resize-none bg-background text-foreground rounded-2xl h-[100px] py-4 px-4 border-border/70 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent shadow-sm transition-all duration-200 ease-in-out hover:shadow-md"
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
