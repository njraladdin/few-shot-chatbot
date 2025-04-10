import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { SendIcon, RefreshCw, PlusCircle, X, Check, ChevronDown, Copy, CheckCheck } from "lucide-react"
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
import Templates, { Template, TEMPLATES_STORAGE_KEY, TEMPLATE_HEIGHTS_STORAGE_KEY, createDefaultTemplate, formatTemplateBlocks } from "@/components/Templates"
import Examples, { Example, ExampleType, EXAMPLES_STORAGE_KEY, exampleTypeLabels } from "@/components/Examples"

// Define types for messages, examples and API
type MessageRole = 'user' | 'assistant';
type Message = { 
  role: MessageRole; 
  content: string; 
  id?: string;
  activeExampleIds?: string[]; // Track which examples were active when the message was sent
};

// For message type selection
type MessageType = 'text' | 'template';

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
  selectedTemplateIndex: number | null,  // Add selectedTemplateIndex parameter
  templates: Template[],
  formatTemplateBlocks: (template: Template) => string
): { contents: any[], tokenCount: number } => {
  let contents: any[] = [];
  let totalText = '';
  
  // Add examples with clear labeling if there are any
  if (examples.length > 0) {
    // System message explaining examples
    const exampleIntro = "I'm using FEW-SHOT LEARNING to guide your responses. I'll provide some examples of the format I want you to follow. Please analyze these examples carefully to understand the pattern, and then apply the same pattern to your responses to my actual queries.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: exampleIntro }]
    });
    totalText += exampleIntro;
    
    const exampleResponse = "I understand. I'll use the few-shot learning examples to guide my responses and follow the same patterns you demonstrate.";
    contents.push({
      role: 'model' as const,
      parts: [{ text: exampleResponse }]
    });
    totalText += exampleResponse;
    
    // Add each example with clear labels
    examples.forEach((example, idx) => {
      const labels = exampleTypeLabels[example.type];
      
      const exampleFirst = `EXAMPLE ${idx + 1} - ${labels.first.toUpperCase()}:\n${example.firstField}`;
      contents.push({
        role: 'user' as const,
        parts: [{ text: exampleFirst }]
      });
      totalText += exampleFirst;
      
      const exampleSecond = `EXAMPLE ${idx + 1} - ${labels.second.toUpperCase()}:\n${example.secondField}`;
      contents.push({
        role: 'model' as const,
        parts: [{ text: exampleSecond }]
      });
      totalText += exampleSecond;
    });
    
    // Add transition messages
    const transition1 = "Now that you've seen the few-shot learning examples, please respond to my actual queries following the same patterns demonstrated in the examples.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: transition1 }]
    });
    totalText += transition1;
    
    const transition2 = "I'll respond to your queries using the patterns demonstrated in the few-shot learning examples.";
    contents.push({
      role: 'model' as const,
      parts: [{ text: transition2 }]
    });
    totalText += transition2;
  }
  
  // Add template (if one is selected) - Only include selected template, not all templates
  if (selectedTemplateIndex !== null && templates.length > selectedTemplateIndex) {
    const selectedTemplate = templates[selectedTemplateIndex];
    
    // System message explaining template
    const templateIntro = "I'm also providing a TEMPLATE that you should consider when responding. This template provides structure or code patterns to use in appropriate contexts.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: templateIntro }]
    });
    totalText += templateIntro;
    
    const templateResponse = "I understand. I'll consider this template when forming my responses where appropriate.";
    contents.push({
      role: 'model' as const,
      parts: [{ text: templateResponse }]
    });
    totalText += templateResponse;
    
    // Add the selected template with clear label
    const templateText = `TEMPLATE - ${formatTemplateBlocks(selectedTemplate)}`;
      contents.push({
        role: 'user' as const,
        parts: [{ text: templateText }]
      });
      totalText += templateText;
      
    const templateConfirm = `I'll use this template when appropriate in my responses.`;
      contents.push({
        role: 'model' as const,
        parts: [{ text: templateConfirm }]
      });
      totalText += templateConfirm;
    
    // Add transition message
    const transition3 = "Now let's proceed with the conversation, using the template and examples as appropriate.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: transition3 }]
    });
    totalText += transition3;
    
    const transition4 = "I'm ready to have our conversation, keeping this template and examples in mind.";
    contents.push({
      role: 'model' as const,
      parts: [{ text: transition4 }]
    });
    totalText += transition4;
  }
  
  // Add the conversation messages
  const conversationMessages = userMessage ? [...messages, userMessage] : messages;
  const conversationContents = conversationMessages.map(msg => {
    totalText += msg.content;
    return {
      role: msg.role === 'assistant' ? 'model' : 'user' as const,
      parts: [{ text: msg.content }]
    };
  });
  
  // Combine everything
  contents = [...contents, ...conversationContents];
  
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  
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
  
  // New state for active examples
  const [activeExampleIds, setActiveExampleIds] = useState<string[]>([]);
  
  // New state for example manager visibility
  const [showExampleManager, setShowExampleManager] = useState<boolean>(false);
  
  // New state for message type selection
  const [messageType, setMessageType] = useState<MessageType>('text');
  // New state for selected template
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number | null>(null);
  // New state for template input values
  const [templateInputValues, setTemplateInputValues] = useState<Record<string, string>>({});
  
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
  
  // For auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // For message editing
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  
  // For template card resizing - needed for the Templates component
  const [templateHeights, setTemplateHeights] = useState<Record<string, number>>(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedHeights = localStorage.getItem(TEMPLATE_HEIGHTS_STORAGE_KEY);
        if (savedHeights) {
          console.log('Initializing template heights from localStorage');
          return JSON.parse(savedHeights);
        }
      } catch (error) {
        console.error("Failed to load template heights from localStorage during initialization:", error);
      }
    }
    return {};
  });
  
  // Calculate active examples
  const activeExamples = examples.filter(ex => activeExampleIds.includes(ex.id));
  
  // Update token count when input or examples/templates change
  useEffect(() => {
    if (input.trim() || (messageType === 'template' && selectedTemplateIndex !== null)) {
      let userMessage: Message;
      
      if (messageType === 'text') {
        userMessage = { role: 'user', content: input };
      } else {
        // For template messages, combine the template inputs with their values
        const template = templates[selectedTemplateIndex!];
        const templateContent = template.inputs.map(inputItem => {
          const value = templateInputValues[inputItem.id] || '';
          return `${inputItem.description}:\n${value}`;
        }).join('\n\n');
        
        userMessage = { role: 'user', content: templateContent };
      }
      
      const { tokenCount } = generateContentsAndCountTokens(
        messages,
        userMessage,
        activeExamples, // Use active examples instead of all examples
        messageType === 'template' ? selectedTemplateIndex : null, // Pass selected template index
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
        activeExamples, // Use active examples instead of all examples
        null, // No template selected when input is empty
        templates,
        formatTemplateBlocks
      );
      setTokenCount(tokenCount);
    }
  }, [input, messages, activeExampleIds, examples, templates, messageType, selectedTemplateIndex, templateInputValues]);
  
  const resizingRef = useRef<{
    isResizing: boolean;
    templateId: string | null;
    startY: number;
    startHeight: number;
  }>({
    isResizing: false,
    templateId: null,
    startY: 0,
    startHeight: 0
  });
  
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
  
  // Enable dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);
  
  // Calculate initial token count on component mount
  useEffect(() => {
    const { tokenCount } = generateContentsAndCountTokens(
      messages,
      null,
      activeExamples, // Use active examples
      null, // No template selected initially
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
  
  // Save template heights to localStorage whenever they change
  useEffect(() => {
    if (isLocalStorageAvailable() && Object.keys(templateHeights).length > 0) {
      try {
        const heightsJSON = JSON.stringify(templateHeights);
        localStorage.setItem(TEMPLATE_HEIGHTS_STORAGE_KEY, heightsJSON);
        console.log('Template heights saved to localStorage:', templateHeights);
      } catch (error) {
        console.error("Failed to save template heights to localStorage:", error);
      }
    }
  }, [templateHeights]);
  
  const handleSendMessage = async () => {
    // For text messages, require input; for templates, require a selected template
    if ((messageType === 'text' && !input.trim()) || 
        (messageType === 'template' && selectedTemplateIndex === null)) {
      return;
    }
    
    let userContent = '';
    
    // Generate content based on message type
    if (messageType === 'text') {
      userContent = input;
    } else if (messageType === 'template' && selectedTemplateIndex !== null) {
      // For template messages, combine the template inputs with their values
      const template = templates[selectedTemplateIndex];
      userContent = template.inputs.map(inputItem => {
        const value = templateInputValues[inputItem.id] || '';
        return `${inputItem.description}:\n${value}`;
      }).join('\n\n');
    }
    
    // Add user message to chat with active examples
    const userMessage: Message = { 
      role: 'user', 
      content: userContent,
      id: `user-${Date.now()}`,
      activeExampleIds: [...activeExampleIds] // Store the currently active examples with this message
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Reset input and template selections
    setInput("");
    if (messageType === 'template') {
      // Clear template input values
      setTemplateInputValues({});
      // Reset to text mode after sending a template message
      setMessageType('text');
      setSelectedTemplateIndex(null);
    }
    
    setIsLoading(true);
    
    try {
      // Use the utility function to generate contents and count tokens
      const { contents, tokenCount } = generateContentsAndCountTokens(
        messages, 
        userMessage, 
        activeExamples, // Use active examples
        messageType === 'template' ? selectedTemplateIndex : null, // Only pass selected template
        templates, 
        formatTemplateBlocks
      );
      
      // Update token count in state
      setTokenCount(tokenCount);
      
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
      
      // Add AI response to chat with same active examples as the user message
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: aiResponse,
        id: `assistant-${Date.now()}`,
        activeExampleIds: [...activeExampleIds] // Store the active examples with the response
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
    
    // Recalculate token count after clearing chat
    const { tokenCount } = generateContentsAndCountTokens(
      [],
      null,
      activeExamples, // Use active examples
      null, // No template selected when input is empty
      templates,
      formatTemplateBlocks
    );
    setTokenCount(tokenCount);
  };
  
  // API configuration from environment variables
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL_ID = "gemini-2.0-flash";
  
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
    // Keep messages up to and including the selected index
    const truncatedMessages = messages.slice(0, index + 1);
    setMessages(truncatedMessages);
    
    const selectedMessage = messages[index];
    
    // Restore examples that were active for this message
    if (selectedMessage.activeExampleIds) {
      setActiveExampleIds(selectedMessage.activeExampleIds);
    }
    
    if (selectedMessage.role === 'user') {
      setIsLoading(true);
      
      try {
        // Use the utility function to generate contents and count tokens
        const { contents, tokenCount } = generateContentsAndCountTokens(
          truncatedMessages,
          null,
          activeExamples, // Use active examples
          null, // No template for re-running message
          templates,
          formatTemplateBlocks
        );
        
        // Update token count in state
        setTokenCount(tokenCount);
        
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
        
        // Add AI response to chat with same active examples as the user message
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: aiResponse,
          id: `assistant-${Date.now()}`,
          activeExampleIds: [...activeExampleIds] // Store the active examples with the response
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

  // Handle mouse movement during resize
  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current.isResizing) return;
    
    const deltaY = e.clientY - resizingRef.current.startY;
    const newHeight = Math.max(100, resizingRef.current.startHeight + deltaY);
    
    setTemplateHeights(prev => ({
      ...prev,
      [resizingRef.current.templateId!]: newHeight
    }));
  };
  
  // Stop resizing
  const stopResizing = () => {
    if (resizingRef.current.isResizing && resizingRef.current.templateId) {
      
      // Explicitly save to localStorage
      if (isLocalStorageAvailable()) {
        try {
          const updatedHeights = {
            ...templateHeights
          };
          const heightsJSON = JSON.stringify(updatedHeights);
          localStorage.setItem(TEMPLATE_HEIGHTS_STORAGE_KEY, heightsJSON);
          console.log('Template heights saved after resize:', updatedHeights);
        } catch (error) {
          console.error("Failed to save template heights after resize:", error);
        }
      }
    }
    
    // Reset resizing state
    resizingRef.current.isResizing = false;
    resizingRef.current.templateId = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
  };
  
  // Cleanup resize listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, []);

  // Function to restore examples that were active for a message
  const restoreExamplesFromMessage = (message: Message) => {
    if (message.activeExampleIds && message.activeExampleIds.length > 0) {
      setActiveExampleIds(message.activeExampleIds);
      setShowExampleManager(true);
    }
  };

  return (
    <div className="min-h-svh bg-background text-foreground antialiased">
      {/* Apple-style top navbar - more compact */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-center h-14">
            <div className="flex-shrink-0">
              <a href="/" className="text-xl font-semibold tracking-tight text-foreground flex items-center">
                <div className="mr-2 rounded-full bg-primary/10 p-1">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 2H15C20 2 22 4 22 9V15C22 20 20 22 15 22H9C4 22 2 20 2 15V9C2 4 4 2 9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8.5 12H15.5" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 15.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Few-Shot Chatbot</span>
              </a>
            </div>
          </div>
        </div>
      </header>
      
      <main className="pt-20 pb-32">
   
        <div className="max-w-5xl mx-auto px-6">  
          {/* Examples Section - Now using the Examples component */}
          <Examples 
            examples={examples} 
            setExamples={setExamples} 
            activeExampleIds={activeExampleIds} 
            setActiveExampleIds={setActiveExampleIds}
            showExampleManager={showExampleManager}
            setShowExampleManager={setShowExampleManager}
          />
          
          {/* Templates Section */}
          <Templates 
            templates={templates}
            setTemplates={setTemplates}
            templateHeights={templateHeights}
            setTemplateHeights={setTemplateHeights}
          />
          
          {/* Chat messages */}
          <section className="mb-48" id="chat">
            <h2 className="text-xl font-semibold tracking-tight mb-4 flex items-center justify-between">
              <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Conversation</span>
              
              {/* Show active examples badge in conversation heading */}
              {activeExampleIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full flex items-center gap-1">
                    <span>{activeExampleIds.length} Example{activeExampleIds.length !== 1 ? 's' : ''} Active</span>
                    <button 
                      className="text-muted-foreground/80 hover:text-muted-foreground"
                      onClick={() => setShowExampleManager(!showExampleManager)}
                      title={showExampleManager ? "Hide example selector" : "Show example selector"}
                    >
                      {showExampleManager ? (
                        <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4.18179 6.18181C4.35753 6.00608 4.64245 6.00608 4.81819 6.18181L7.49999 8.86362L10.1818 6.18181C10.3575 6.00608 10.6424 6.00608 10.8182 6.18181C10.9939 6.35755 10.9939 6.64247 10.8182 6.81821L7.81819 9.81821C7.73379 9.9026 7.61934 9.95001 7.49999 9.95001C7.38064 9.95001 7.26618 9.9026 7.18179 9.81821L4.18179 6.81821C4.00605 6.64247 4.00605 6.35755 4.18179 6.18181Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </h2>
            <div className="space-y-4 mb-16 rounded-2xl border p-5 bg-card/30 backdrop-blur-sm min-h-[300px]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-center">
                  <p className="text-muted-foreground mb-2">
                    Add examples above, then start a conversation
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {examples.length > 0 ? (
                      activeExampleIds.length > 0 ? 
                        `The AI will follow the patterns from your ${activeExampleIds.length} selected examples` :
                        "Select examples to guide the AI's responses"
                    ) : (
                      "Create examples to guide the AI's responses"
                    )}
                  </p>
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
                            className="h-9 w-9 p-0 bg-zinc-800/90 text-zinc-200 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                            onClick={saveMessageEdit}
                            title="Save changes"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              className="h-9 w-9 p-0 bg-zinc-800/90 text-zinc-300 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                              onClick={() => startEditingMessage(index)}
                              title="Edit message"
                            >
                              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                                <path d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                              </svg>
                            </Button>
                            {message.role === 'user' && (
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-9 w-9 p-0 bg-zinc-800/90 text-zinc-300 backdrop-blur-sm border border-zinc-700/50 shadow-sm rounded-full hover:bg-zinc-700/90 transition-colors" 
                                onClick={() => runFromMessage(index)}
                                title="Run from this message"
                                disabled={isLoading}
                              >
                                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
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
                            className="flex-1 p-3 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-border focus:ring-1 focus:ring-border scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
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
                        <div className="whitespace-pre-wrap overflow-hidden break-words">
                          {/* Show example indicator for messages that used examples */}
                          {message.activeExampleIds && message.activeExampleIds.length > 0 && (
                            <div 
                              className="mb-2 text-xs text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground/80 transition-colors"
                              onClick={() => restoreExamplesFromMessage(message)}
                              title="Click to restore these examples as active"
                            >
                              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1.90321 7.29677C1.90321 10.341 4.11041 12.4147 6.58893 12.8439C6.87255 12.893 7.06266 13.1627 7.01355 13.4464C6.96444 13.73 6.69471 13.9201 6.41109 13.871C3.49942 13.3668 0.86084 10.9127 0.86084 7.29677C0.860839 5.76009 1.55996 4.55245 2.37639 3.63377C2.96124 2.97568 3.63034 2.44135 4.16846 2.03202L2.53205 2.03202C2.25591 2.03202 2.03205 1.80816 2.03205 1.53202C2.03205 1.25588 2.25591 1.03202 2.53205 1.03202L5.53205 1.03202C5.80819 1.03202 6.03205 1.25588 6.03205 1.53202L6.03205 4.53202C6.03205 4.80816 5.80819 5.03202 5.53205 5.03202C5.25591 5.03202 5.03205 4.80816 5.03205 4.53202L5.03205 2.68645L5.03054 2.68759L5.03045 2.68766L5.03044 2.68767L5.03043 2.68767C4.45896 3.11868 3.76059 3.64538 3.15554 4.3262C2.44102 5.13021 1.90321 6.10154 1.90321 7.29677ZM13.0109 7.70321C13.0109 4.69115 10.8505 2.6296 8.40384 2.17029C8.12093 2.11718 7.93465 1.84479 7.98776 1.56188C8.04087 1.27898 8.31326 1.0927 8.59616 1.14581C11.4704 1.68541 14.0532 4.12605 14.0532 7.70321C14.0532 9.23988 13.3541 10.4475 12.5377 11.3662C11.9528 12.0243 11.2837 12.5586 10.7456 12.968L12.3821 12.968C12.6582 12.968 12.8821 13.1918 12.8821 13.468C12.8821 13.7441 12.6582 13.968 12.3821 13.968L9.38205 13.968C9.10591 13.968 8.88205 13.7441 8.88205 13.468L8.88205 10.468C8.88205 10.1918 9.10591 9.96796 9.38205 9.96796C9.65819 9.96796 9.88205 10.1918 9.88205 10.468L9.88205 12.3135L9.88362 12.3123C10.4551 11.8813 11.1535 11.3546 11.7585 10.6738C12.4731 9.86976 13.0109 8.89844 13.0109 7.70321Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                              </svg>
                              <span>Using {message.activeExampleIds.length} example{message.activeExampleIds.length !== 1 ? 's' : ''}</span>
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
                                          className="markdown-code-block p-0" 
                                          style={{ 
                                            borderRadius: '0.75rem', 
                                            padding: '1.25rem',
                                            paddingRight: '2.5rem' 
                                          }} 
                                          {...props}
                                        >
                                          {children}
                                        </pre>
                                        <button
                                          onClick={handleCopy}
                                          className="code-copy-button absolute top-3 right-3 p-1.5 rounded-md transition-opacity duration-200 hover:bg-secondary text-muted-foreground hover:text-foreground"
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
                              className="cursor-pointer hover:bg-opacity-90 transition-colors"
                              onClick={() => startEditingMessage(index)}
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
          </section>
        </div>
        
        {/* Input area - Updated with message type selection */}
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-background/80 border-t border-border/30 py-6 pb-8 sm:pb-16">
          <div className="max-w-5xl mx-auto px-6">
            {/* UI Controls Section with clear separation */}
            <div className="mb-4">
              {/* Combined control row for Examples and Message Type */}
              <div className="flex justify-between items-center mb-3 pb-3 border-b border-border/20">
                {/* Examples Selection Section - Left side */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Few-Shot Learning:</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full px-4 h-8 text-xs font-medium transition-colors flex items-center gap-1.5 bg-card/80 hover:bg-card"
                    onClick={() => setShowExampleManager(!showExampleManager)}
                  >
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 15 15" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`mr-1 transition-transform duration-200 ${showExampleManager ? 'rotate-180' : ''}`}
                    >
                      <path d="M4.18179 6.18181C4.35753 6.00608 4.64245 6.00608 4.81819 6.18181L7.49999 8.86362L10.1818 6.18181C10.3575 6.00608 10.6424 6.00608 10.8182 6.18181C10.9939 6.35755 10.9939 6.64247 10.8182 6.81821L7.81819 9.81821C7.73379 9.9026 7.61934 9.95001 7.49999 9.95001C7.38064 9.95001 7.26618 9.9026 7.18179 9.81821L4.18179 6.81821C4.00605 6.64247 4.00605 6.35755 4.18179 6.18181Z" 
                        fill="currentColor" 
                        fillRule="evenodd" 
                        clipRule="evenodd"
                      />
                    </svg>
                    Active Examples 
                    <span className="inline-flex items-center justify-center bg-card text-muted-foreground text-[10px] rounded-full h-5 min-w-[20px] px-1.5 ml-1 border border-border/40">
                      {activeExampleIds.length}
                    </span>
                  </Button>
                </div>
                
                {/* Message Type Selector - Right side */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Message Type:</span>
                  <div className="flex gap-1 p-1 bg-muted/60 rounded-full">
                    <Button
                      variant={messageType === 'text' ? 'default' : 'ghost'}
                      size="sm"
                      className={`rounded-full px-4 h-7 text-xs font-medium transition-colors ${
                        messageType === 'text' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/80'
                      }`}
                      onClick={() => {
                        setMessageType('text');
                        setSelectedTemplateIndex(null);
                      }}
                    >
                      Text
                    </Button>
                    <Button
                      variant={messageType === 'template' ? 'default' : 'ghost'}
                      size="sm"
                      className={`rounded-full px-4 h-7 text-xs font-medium transition-colors ${
                        messageType === 'template' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/80'
                      }`}
                      onClick={() => setMessageType('template')}
                    >
                      Template
                    </Button>
                  </div>
                  
                  {/* Template selector - Only visible when template mode is selected */}
                  {messageType === 'template' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full px-4 h-7 text-xs font-medium transition-colors bg-card/80 hover:bg-card"
                        >
                          {selectedTemplateIndex !== null
                            ? `Template ${selectedTemplateIndex + 1}`
                            : 'Select Template'}
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg p-1 border-border/30">
                        {templates.map((template, index) => (
                          <DropdownMenuItem
                            key={template.id}
                            onClick={() => setSelectedTemplateIndex(index)}
                            className="cursor-pointer rounded-lg py-2 transition-colors"
                          >
                            Template {index + 1}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                
                {/* Token count indicator moved to far right */}
                <div 
                  className="text-xs text-muted-foreground/70 bg-background/80 px-2 py-1 rounded-md shadow-sm backdrop-blur-sm hover:bg-background cursor-pointer group ml-2"
                  title="Estimated token count for the entire API request"
                >
                  ~{tokenCount.toLocaleString()} tokens
                  <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-48 bg-background/95 border border-border shadow-lg rounded-lg p-2 text-xs z-10">
                    <p className="font-medium mb-1">Token Estimate:</p>
                    <p className="mb-1">• {activeExampleIds.length} Active Examples</p>
                    <p className="mb-1">• Templates</p>
                    <p className="mb-1">• Conversation history</p>
                    {((messageType === 'text' && input.trim()) || 
                      (messageType === 'template' && selectedTemplateIndex !== null)) && 
                      <p className="mb-1">• Current message</p>}
                    <p className="mt-2 pt-1 border-t border-border/50 text-[10px] font-medium">Based on ~4 chars per token</p>
                  </div>
                </div>
              </div>
              
              {/* Re-add Example Manager Dropdown for the input area */}
              {showExampleManager && (
                <div className="mb-4 bg-card/60 backdrop-blur-sm rounded-xl border p-3 animate-in fade-in duration-150 slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm font-medium">Example Selection</div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs rounded-md"
                        onClick={() => {
                          // Toggle all examples
                          if (activeExampleIds.length === examples.length) {
                            // If all examples are selected, deselect all
                            setActiveExampleIds([]);
                          } else {
                            // Otherwise, select all examples
                            setActiveExampleIds(examples.map(ex => ex.id));
                          }
                        }}
                      >
                        {activeExampleIds.length === examples.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                  </div>
                  
                  {examples.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2 flex items-center justify-between">
                      <span>No examples available.</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-3 text-xs rounded-md"
                        onClick={() => {
                          // Scroll to examples section to create a new example
                          document.getElementById('examples')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        Create Example
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-1">
                      {examples.map((example, index) => {
                        const isActive = activeExampleIds.includes(example.id);
                        const labels = exampleTypeLabels[example.type];
                        
                        return (
                          <div 
                            key={example.id}
                            className={`p-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                              isActive 
                                ? 'border-primary/40 bg-primary/10 hover:bg-primary/20' 
                                : 'border-border/40 hover:bg-card/80'
                            }`}
                            onClick={() => {
                              // Toggle example selection using state setter
                              setActiveExampleIds(prev => {
                                if (prev.includes(example.id)) {
                                  return prev.filter(id => id !== example.id);
                                } else {
                                  return [...prev, example.id];
                                }
                              });
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-medium">Example {index + 1}</div>
                              <div className={`h-3 w-3 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`}></div>
                            </div>
                            <div className="line-clamp-1 text-muted-foreground">
                              {labels.first}: {example.firstField.substring(0, 30)}
                              {example.firstField.length > 30 && '...'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Message Input Area */}
            <div className="flex gap-3">
            <div className="flex-1 relative">
                {messageType === 'text' ? (
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
                className="w-full resize-none overflow-y-auto bg-background text-foreground rounded-2xl min-h-[60px] max-h-[180px] py-4 px-4 border-border focus:outline-none focus:border-border focus:ring-1 focus:ring-border/50 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent shadow-sm transition-shadow duration-200 ease-in-out hover:shadow-md"
                style={{ 
                  height: textareaRef.current?.scrollHeight 
                    ? `${Math.min(textareaRef.current.scrollHeight, 180)}px` 
                    : '60px' 
                }}
              />
                ) : (
                  <div className="bg-background border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200">
                    {selectedTemplateIndex !== null ? (
                      <div className="space-y-4">
                        {templates[selectedTemplateIndex].inputs.map((input, idx) => (
                          <div key={input.id} className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">{input.description}</label>
                            <Textarea
                              value={templateInputValues[input.id] || ''}
                              onChange={(e) => {
                                setTemplateInputValues(prev => ({
                                  ...prev,
                                  [input.id]: e.target.value
                                }));
                              }}
                              placeholder={`Enter value for this template...`}
                              className="w-full resize-none overflow-y-auto bg-background/50 text-foreground rounded-lg min-h-[60px] max-h-[180px] py-3 px-3 border-border/50 focus:outline-none focus:border-border focus:ring-1 focus:ring-border/50 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                            />
                </div>
                        ))}
              </div>
                    ) : (
                      <div className="flex items-center justify-center h-[60px] text-muted-foreground text-sm">
                        Select a template from the dropdown above
                      </div>
                    )}
                  </div>
                )}
            </div>
            <Button 
              onClick={handleSendMessage} 
                disabled={isLoading || (messageType === 'template' && selectedTemplateIndex === null)} 
              className="rounded-full h-12 w-12 p-0 flex items-center justify-center flex-shrink-0 shadow-sm hover:shadow transition-all duration-200"
            >
              <SendIcon className="h-5 w-5" />
            </Button>
            <Button 
              variant="outline" 
              onClick={clearChat} 
              className="rounded-full h-12 px-5 text-sm font-medium flex-shrink-0 shadow-sm hover:shadow-none transition-all duration-200"
            >
              Clear
            </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
