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

// Define types for messages, examples and API
type MessageRole = 'user' | 'assistant';
type Message = { role: MessageRole; content: string; id?: string };


// Define the Example types for few-shot learning
type ExampleType = 'input-output' | 'name-content';

type Example = {
  type: ExampleType;
  firstField: string;
  secondField: string;
};

// Define Template type for reusable templates with variables
// Templates are automatically included in the conversation context, similar to examples
type Template = {
  id: string;
  inputs: TemplateInput[];
};

type TemplateInput = {
  id: string;
  description: string;
  content: string;
};

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
  
  // Add templates with clear labeling if there are any
  if (templates.length > 0) {
    // System message explaining templates
    const templateIntro = "I'm also providing TEMPLATES that you should consider when responding. These templates provide structure or code patterns to use in appropriate contexts.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: templateIntro }]
    });
    totalText += templateIntro;
    
    const templateResponse = "I understand. I'll consider these templates when forming my responses where appropriate.";
    contents.push({
      role: 'model' as const,
      parts: [{ text: templateResponse }]
    });
    totalText += templateResponse;
    
    // Add each template with clear labels
    templates.forEach((template, idx) => {
      const templateText = `TEMPLATE ${idx + 1} - ${formatTemplateBlocks(template)}`;
      contents.push({
        role: 'user' as const,
        parts: [{ text: templateText }]
      });
      totalText += templateText;
      
      const templateConfirm = `I'll use TEMPLATE ${idx + 1} when appropriate in my responses.`;
      contents.push({
        role: 'model' as const,
        parts: [{ text: templateConfirm }]
      });
      totalText += templateConfirm;
    });
    
    // Add transition message
    const transition3 = "Now let's proceed with the conversation, using templates and examples as appropriate.";
    contents.push({
      role: 'user' as const,
      parts: [{ text: transition3 }]
    });
    totalText += transition3;
    
    const transition4 = "I'm ready to have our conversation, keeping these templates and examples in mind.";
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

// Labels for different example types
const exampleTypeLabels: Record<ExampleType, { first: string, second: string }> = {
  'input-output': { first: 'Input', second: 'Output' },
  'name-content': { first: 'Name', second: 'Content' },
};

// localStorage key for saving examples
const EXAMPLES_STORAGE_KEY = 'few-shot-chatbot-examples';
const TEMPLATES_STORAGE_KEY = 'few-shot-chatbot-templates';
const TEMPLATE_HEIGHTS_STORAGE_KEY = 'few-shot-chatbot-template-heights';

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
          return JSON.parse(savedExamples);
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
  
  // Function to create default template
  function createDefaultTemplate(): Template {
    return {
      id: `template-default-${Date.now()}`,
      inputs: [
        {
          id: "input-1",
          description: "JavaScript code to convert to Scraper format",
          content: `// Example: Convert this code to use the Scraper class
const baseAPI = 'https://api.example.com';

async function fetchData() {
  try {
    const response = await fetch(\`\${baseAPI}/data\`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}
`
        }
      ]
    };
  }
  
  // For auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // For message editing
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  // For template description inline editing
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [editingInputIndex, setEditingInputIndex] = useState<number | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  
  // For template card resizing
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
  
  // Update token count when input or examples/templates change
  useEffect(() => {
    if (input.trim()) {
      const userMessage: Message = { role: 'user', content: input };
      const { tokenCount } = generateContentsAndCountTokens(
        messages,
        userMessage,
        examples,
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
        examples,
        templates,
        formatTemplateBlocks
      );
      setTokenCount(tokenCount);
    }
  }, [input, messages, examples, templates]);
  
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
      examples,
      templates,
      formatTemplateBlocks
    );
    setTokenCount(tokenCount);
  }, []);
  
  // Load examples from localStorage on component mount - this is now redundant but kept as a backup
  useEffect(() => {
    if (isLocalStorageAvailable()) {
      try {
        const savedExamples = localStorage.getItem(EXAMPLES_STORAGE_KEY);
        console.log('Retrieved from localStorage:', savedExamples);
        if (savedExamples && examples.length === 0) {
          const parsedExamples = JSON.parse(savedExamples);
          setExamples(parsedExamples);
          console.log('Examples loaded from localStorage:', parsedExamples);
        }
      } catch (error) {
        console.error("Failed to parse saved examples:", error);
      }
    }
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
    if (!input.trim()) return;
    
    // Add user message to chat
    const userMessage: Message = { 
      role: 'user', 
      content: input,
      id: `user-${Date.now()}` 
    };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      // Use the utility function to generate contents and count tokens
      const { contents, tokenCount } = generateContentsAndCountTokens(
        messages, 
        userMessage, 
        examples, 
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
    
    // Recalculate token count after clearing chat
    const { tokenCount } = generateContentsAndCountTokens(
      [],
      null,
      examples,
      templates,
      formatTemplateBlocks
    );
    setTokenCount(tokenCount);
  };
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'firstField' | 'secondField' | null>(null);
  const [editValue, setEditValue] = useState("");

  // API configuration from environment variables
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL_ID = "gemini-2.0-flash";
  
  // Add a new example directly with empty fields in edit mode
  const addNewExample = (type: ExampleType) => {
    const newExampleId = examples.length;
    const newExample: Example = {
      type,
      firstField: "",
      secondField: ""
    };
    setExamples([...examples, newExample]);
    
    // Put the new example's first field in edit mode
    setEditingIndex(newExampleId);
    setEditingField('firstField');
    setEditValue("");
  };
  
  // Edit example field
  const startEditing = (index: number, field: 'firstField' | 'secondField') => {
    setEditingIndex(index);
    setEditingField(field);
    setEditValue(examples[index][field]);
  };
  
  // Save example edit
  const saveEdit = () => {
    if (editingIndex !== null && editingField !== null) {
      const updatedExamples = [...examples];
      // If it's a new empty example being created, only save if there's content
      const shouldUpdate = updatedExamples[editingIndex][editingField] !== "" || editValue.trim() !== "";
      
      if (shouldUpdate) {
        updatedExamples[editingIndex] = {
          ...updatedExamples[editingIndex],
          [editingField]: editValue
        };
        setExamples(updatedExamples);
      }
      
      // If we just edited firstField, move to secondField
      if (editingField === 'firstField' && updatedExamples[editingIndex].secondField === "") {
        setEditingField('secondField');
        setEditValue("");
      } else {
        // Otherwise, exit edit mode
        setEditingIndex(null);
        setEditingField(null);
      }
    }
  };
  
  // Cancel example edit
  const cancelEdit = () => {
    // Check if this is a new example with empty fields
    if (editingIndex !== null && 
        examples[editingIndex].firstField === "" && 
        examples[editingIndex].secondField === "") {
      // Remove the empty example
      setExamples(examples.filter((_, i) => i !== editingIndex));
    }
    
    setEditingIndex(null);
    setEditingField(null);
  };
  
  // Change example type
  const changeExampleType = (index: number, type: ExampleType) => {
    const updatedExamples = [...examples];
    updatedExamples[index] = {
      ...updatedExamples[index],
      type
    };
    setExamples(updatedExamples);
  };
  
  // Template management functions
  const addTemplate = () => {
    const template: Template = {
      id: `template-${Date.now()}`,
      inputs: [
        {
          id: `input-${Date.now()}`,
          description: "New input",
          content: ""
        }
      ]
    };
    setTemplates([...templates, template]);
  };
  
  const removeTemplate = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };
  
  // Debug localStorage on component mount
  useEffect(() => {
    if (isLocalStorageAvailable()) {
      console.log('✓ localStorage is available');
      try {
        // Store a test message specifically for the examples
        localStorage.setItem('localStorage-test', 'This is a test message for localStorage');
        console.log('✓ Test message successfully stored in localStorage');
        
        // Try retrieving the examples
        const examplesData = localStorage.getItem(EXAMPLES_STORAGE_KEY);
        console.log(`Examples data in localStorage: ${examplesData ? 'Data found' : 'No data found'}`);
        if (examplesData) {
          console.log('Examples data content:', examplesData);
        }
      } catch (error) {
        console.error('❌ Error when testing localStorage:', error);
      }
    } else {
      console.error('❌ localStorage is NOT available!');
    }
  }, []);

  // Remove example
  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
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
          examples,
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
    }
  };

  // Function to format template inputs for API
  const formatTemplateBlocks = (template: Template): string => {
    return template.inputs.map(input => {
      return `${input.description}:\n${input.content}`;
    }).join('\n\n');
  };

  // Template description inline editing functions
  const startEditingDescription = (templateIndex: number, inputIndex: number) => {
    setEditingTemplateIndex(templateIndex);
    setEditingInputIndex(inputIndex);
    setEditingDescription(templates[templateIndex].inputs[inputIndex].description);
  };
  
  const saveDescriptionEdit = () => {
    if (editingTemplateIndex !== null && editingInputIndex !== null && editingDescription.trim()) {
      const updatedTemplates = [...templates];
      updatedTemplates[editingTemplateIndex].inputs[editingInputIndex].description = editingDescription;
      setTemplates(updatedTemplates);
      cancelDescriptionEdit();
    }
  };
  
  const cancelDescriptionEdit = () => {
    setEditingTemplateIndex(null);
    setEditingInputIndex(null);
    setEditingDescription("");
  };

  // Add input to existing template
  const addInputToExistingTemplate = (templateIndex: number) => {
    const updatedTemplates = [...templates];
    const newInputId = `input-${Date.now()}`;
    updatedTemplates[templateIndex].inputs.push({
      id: newInputId,
      description: "New input",
      content: ""
    });
    setTemplates(updatedTemplates);
    
    // Immediately put the new input description in edit mode
    setEditingTemplateIndex(templateIndex);
    setEditingInputIndex(updatedTemplates[templateIndex].inputs.length - 1);
    setEditingDescription("New input");
  };

  // Start resizing
  const startResizing = (e: React.MouseEvent, templateId: string, currentHeight: number) => {
    e.preventDefault();
    resizingRef.current = {
      isResizing: true,
      templateId,
      startY: e.clientY,
      startHeight: currentHeight
    };
    
    // Add event listeners for mouse move and up
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
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
          {/* Examples Section */}
          <section className="mb-8" id="examples">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold tracking-tight">
                <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Examples</span>
              </h2>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium bg-primary/10 text-primary-foreground/90 border-primary-foreground/20 hover:bg-primary/20 transition-colors">
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add Example
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg p-1 border-border/30">
                  <DropdownMenuItem 
                    onClick={() => addNewExample('input-output')}
                    className="cursor-pointer rounded-lg py-2 transition-colors"
                  >
                    Input-Output
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => addNewExample('name-content')}
                    className="cursor-pointer rounded-lg py-2 transition-colors"
                  >
                    Name-Content
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            {/* Example list */}
            <div className="space-y-4 mb-6">
              {examples.map((example, index) => {
                const labels = exampleTypeLabels[example.type];
                return (
                  <div key={index} className="border rounded-2xl p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="flex justify-between mb-3">
                      <div className="font-medium text-sm text-muted-foreground flex items-center">
                        <span className="bg-primary/10 text-primary-foreground/90 py-0.5 px-2.5 rounded-full text-xs">Example {index + 1}</span>
                        <div className="ml-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 flex items-center gap-1 px-2.5 text-xs font-normal rounded-full bg-muted/50 hover:bg-muted/80 transition-colors"
                              >
                                {example.type === 'input-output' ? 'Input-Output' : 'Name-Content'}
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-32 rounded-xl shadow-lg">
                              <DropdownMenuItem 
                                onClick={() => changeExampleType(index, 'input-output')}
                                className={`cursor-pointer rounded-lg ${example.type === 'input-output' ? 'font-medium' : ''}`}
                              >
                                Input-Output
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => changeExampleType(index, 'name-content')}
                                className={`cursor-pointer rounded-lg ${example.type === 'name-content' ? 'font-medium' : ''}`}
                              >
                                Name-Content
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors" 
                        onClick={() => removeExample(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-sm">
                      <div className="mb-4">
                        <div className="flex items-baseline mb-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">{labels.first}</span>
                          <div className="flex-grow ml-2 border-t border-dashed border-border/30"></div>
                        </div>
                        {editingIndex === index && editingField === 'firstField' ? (
                          <div className="flex items-start mt-1.5">
                            <Textarea 
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1 p-3 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit();
                                } else if (e.key === 'Escape') {
                                  cancelEdit();
                                }
                              }}
                              autoFocus
                            />
                            <div className="flex flex-col ml-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 mb-1.5 text-green-500 rounded-full transition-colors duration-200" 
                                onClick={saveEdit}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-muted-foreground rounded-full transition-colors duration-200" 
                                onClick={cancelEdit}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer group hover:bg-accent hover:text-accent-foreground px-3 py-2 rounded-lg border border-transparent hover:border-border/30 max-h-[500px] overflow-y-auto block mt-1 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent transition-all duration-150"
                            onClick={() => startEditing(index, 'firstField')}
                          >
                            {example.firstField || 
                              <span className="italic text-muted-foreground/70">Click to add content...</span>
                            }
                          </div>
                        )}
                      </div>
                      <div className="mb-1">
                        <div className="flex items-baseline mb-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">{labels.second}</span>
                          <div className="flex-grow ml-2 border-t border-dashed border-border/30"></div>
                        </div>
                        {editingIndex === index && editingField === 'secondField' ? (
                          <div className="flex items-start mt-1.5">
                            <Textarea 
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1 p-3 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit();
                                } else if (e.key === 'Escape') {
                                  cancelEdit();
                                }
                              }}
                              autoFocus
                            />
                            <div className="flex flex-col ml-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 mb-1.5 text-green-500 rounded-full transition-colors duration-200" 
                                onClick={saveEdit}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-muted-foreground rounded-full transition-colors duration-200" 
                                onClick={cancelEdit}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer group hover:bg-accent hover:text-accent-foreground px-3 py-2 rounded-lg border border-transparent hover:border-border/30 max-h-[500px] overflow-y-auto block mt-1 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent transition-all duration-150"
                            onClick={() => startEditing(index, 'secondField')}
                          >
                            {example.secondField || 
                              <span className="italic text-muted-foreground/70">Click to add content...</span>
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          
          {/* Templates Section */}
          <section className="mb-8" id="templates">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold tracking-tight">
                <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Templates</span>
              </h2>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium bg-primary/10 text-primary-foreground/90 border-primary-foreground/20 hover:bg-primary/20 transition-colors"
                onClick={addTemplate}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add Template
              </Button>
            </div>
            
            {/* Template list */}
            <div className="space-y-4 mb-6">
              {templates.map((template, index) => (
                <div key={template.id} className="border rounded-xl p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200 relative">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-medium bg-muted/50 py-0.5 px-2.5 rounded-full text-muted-foreground">Template</h3>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors" 
                      onClick={() => removeTemplate(index)}
                      title="Delete template"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  <div 
                    className="overflow-y-auto mb-4 rounded-lg border border-border/30 p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-card/50"
                    style={{ 
                      maxHeight: templateHeights[template.id] || 300,
                      height: templateHeights[template.id] ? `${templateHeights[template.id]}px` : 'auto'
                    }}
                  >
                    {template.inputs.map((input, idx) => (
                      <div key={idx} className="mb-4 text-sm">
                        <div className="p-3 group/input relative">
                          <div className="mb-2">
                            {editingTemplateIndex === index && editingInputIndex === idx ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingDescription}
                                  onChange={(e) => setEditingDescription(e.target.value)}
                                  className="flex-1"
                                  placeholder="Enter description..."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      saveDescriptionEdit();
                                    } else if (e.key === 'Escape') {
                                      cancelDescriptionEdit();
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-green-500 rounded-full hover:bg-background/90"
                                  onClick={saveDescriptionEdit}
                                  title="Save"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground rounded-full hover:bg-background/90"
                                  onClick={cancelDescriptionEdit}
                                  title="Cancel"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-baseline gap-1 group mb-1.5">
                                <span 
                                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80 cursor-pointer flex items-center gap-1"
                                  onClick={() => startEditingDescription(index, idx)}
                                  title="Click to edit description"
                                >
                                  {input.description || "Click to add description"}
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingDescription(index, idx);
                                    }}
                                  >
                                    <svg 
                                      width="10" 
                                      height="10" 
                                      viewBox="0 0 15 15" 
                                      fill="none" 
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="text-muted-foreground"
                                    >
                                      <path 
                                        d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z" 
                                        fill="currentColor" 
                                        fillRule="evenodd" 
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </Button>
                                </span>
                                <div className="flex-grow ml-1 border-t border-dashed border-border/30"></div>
                              </div>
                            )}
                          </div>
                          <Textarea
                            value={input.content}
                            onChange={(e) => {
                              const updatedTemplates = [...templates];
                              updatedTemplates[index].inputs[idx].content = e.target.value;
                              setTemplates(updatedTemplates);
                            }}
                            className="w-full p-3 text-sm border rounded-lg bg-background/60 hover:bg-background resize-none min-h-[80px] max-h-[500px] overflow-y-auto focus:outline-none focus:ring-1 focus:ring-border transition-colors duration-200"
                            placeholder="Enter your input here..."
                          />
                          
                          {/* Delete input button - appears on hover */}
                          {template.inputs.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/input:opacity-100 transition-opacity rounded-full z-10"
                              onClick={() => {
                                const updatedTemplates = [...templates];
                                updatedTemplates[index].inputs = updatedTemplates[index].inputs.filter((_, i) => i !== idx);
                                setTemplates(updatedTemplates);
                              }}
                              title="Remove this input"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Subtle add input button */}
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-all rounded-full px-4 hover:bg-muted/80"
                        onClick={() => addInputToExistingTemplate(index)}
                        title="Add another input field"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        <span>Add input</span>
                      </Button>
                    </div>
                  </div>

                  <div className="mb-2 text-xs flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {template.inputs.length} Input {template.inputs.length === 1 ? 'Field' : 'Fields'}
                    </span>
                  </div>
                  
                  {/* Resize handle */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex justify-center items-center hover:bg-muted/30 rounded-b-xl transition-colors duration-200" 
                    onMouseDown={(e) => startResizing(e, template.id, templateHeights[template.id] || 300)}
                    title="Drag to resize"
                  >
                    <div className="w-10 h-[2px] bg-muted-foreground/30 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          {/* Chat messages */}
          <section className="mb-48" id="chat">
            <h2 className="text-xl font-semibold tracking-tight mb-4">
              <span className="bg-gradient-to-r from-primary to-purple-400 text-transparent bg-clip-text">Conversation</span>
            </h2>
            <div className="space-y-4 mb-16 rounded-2xl border p-5 bg-card/30 backdrop-blur-sm min-h-[300px]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-72 text-center">
                  <p className="text-muted-foreground mb-2">
                    Add examples above, then start a conversation
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The AI will follow the patterns you've demonstrated in your examples
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
        
        {/* Input area - Updated with larger size and no focus effects */}
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-background/80 border-t border-border/30 py-6 pb-8 sm:pb-16">
          <div className="max-w-5xl mx-auto px-6 flex gap-3">
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
                className="w-full resize-none overflow-y-auto bg-background text-foreground rounded-2xl min-h-[60px] max-h-[180px] py-4 px-4 border-border focus:outline-none focus:border-border focus:ring-1 focus:ring-border/50 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent shadow-sm transition-shadow duration-200 ease-in-out hover:shadow-md"
                style={{ 
                  height: textareaRef.current?.scrollHeight 
                    ? `${Math.min(textareaRef.current.scrollHeight, 180)}px` 
                    : '60px' 
                }}
              />
              {/* Token count indicator with hover details */}
              <div 
                className="absolute bottom-3 right-3 text-xs text-muted-foreground/70 bg-background/80 px-2 py-1 rounded-md shadow-sm backdrop-blur-sm hover:bg-background cursor-pointer group"
                title="Estimated token count for the entire API request"
              >
                ~{tokenCount.toLocaleString()} tokens
                <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 w-48 bg-background/95 border border-border shadow-lg rounded-lg p-2 text-xs">
                  <p className="font-medium mb-1">Token Estimate:</p>
                  <p className="mb-1">• Examples + Templates</p>
                  <p className="mb-1">• Conversation history</p>
                  {input.trim() && <p className="mb-1">• Current message</p>}
                  <p className="mt-2 pt-1 border-t border-border/50 text-[10px] font-medium">Based on ~4 chars per token</p>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleSendMessage} 
              disabled={isLoading} 
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
      </main>
    </div>
  )
}

export default App
