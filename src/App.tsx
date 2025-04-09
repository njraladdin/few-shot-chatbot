import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
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
  
  // Template editing state
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<Template>>({
    inputs: []
  });
  
  // For auto-resizing textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // For message editing
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  // For template description inline editing
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [editingInputIndex, setEditingInputIndex] = useState<number | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  
  // For section navigation
  const [activeTab, setActiveTab] = useState<'examples' | 'templates' | 'conversation'>('examples');
  
  // For template card resizing
  const [templateHeights, setTemplateHeights] = useState<Record<string, number>>({});
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
      
      // Add templates with clear labeling if there are any
      if (templates.length > 0) {
        // Add a system message explaining the templates
        contents.push({
          role: 'user' as const,
          parts: [{ text: "I'm also providing TEMPLATES that you should consider when responding. These templates provide structure or code patterns to use in appropriate contexts." }]
        });
        
        contents.push({
          role: 'model' as const,
          parts: [{ text: "I understand. I'll consider these templates when forming my responses where appropriate." }]
        });
        
        // Add each template with clear labels
        templates.forEach((template, idx) => {
          contents.push({
            role: 'user' as const,
            parts: [{ text: `TEMPLATE ${idx + 1} - ${formatTemplateBlocks(template)}` }]
          });
          
          contents.push({
            role: 'model' as const,
            parts: [{ text: `I'll use TEMPLATE ${idx + 1} when appropriate in my responses.` }]
          });
        });
        
        // Add a transition message
        contents.push({
          role: 'user' as const,
          parts: [{ text: "Now let's proceed with the conversation, using templates and examples as appropriate." }]
        });
        
        contents.push({
          role: 'model' as const,
          parts: [{ text: "I'm ready to have our conversation, keeping these templates and examples in mind." }]
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
  
  // Template block management
  const addInputToTemplate = () => {
    setNewTemplate({
      ...newTemplate,
      inputs: [
        ...(newTemplate.inputs || []),
        { id: `input-${Date.now()}`, description: "", content: "" }
      ]
    });
  };
  
  const updateInputInTemplate = (index: number, field: keyof TemplateInput, value: string) => {
    const inputs = newTemplate.inputs || [];
    
    const updatedInputs = [...inputs];
    updatedInputs[index] = {
      ...updatedInputs[index],
      [field]: value
    };
    
    setNewTemplate({
      ...newTemplate,
      inputs: updatedInputs
    });
  };
  
  const removeInputFromTemplate = (index: number) => {
    const inputs = newTemplate.inputs || [];
    
    setNewTemplate({
      ...newTemplate,
      inputs: inputs.filter((_, i) => i !== index)
    });
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
        
        // Add templates with clear labeling if there are any
        if (templates.length > 0) {
          // Add a system message explaining the templates
          contents.push({
            role: 'user' as const,
            parts: [{ text: "I'm also providing TEMPLATES that you should consider when responding. These templates provide structure or code patterns to use in appropriate contexts." }]
          });
          
          contents.push({
            role: 'model' as const,
            parts: [{ text: "I understand. I'll consider these templates when forming my responses where appropriate." }]
          });
          
          // Add each template with clear labels
          templates.forEach((template, idx) => {
            contents.push({
              role: 'user' as const,
              parts: [{ text: `TEMPLATE ${idx + 1} - ${formatTemplateBlocks(template)}` }]
            });
            
            contents.push({
              role: 'model' as const,
              parts: [{ text: `I'll use TEMPLATE ${idx + 1} when appropriate in my responses.` }]
            });
          });
          
          // Add a transition message
          contents.push({
            role: 'user' as const,
            parts: [{ text: "Now let's proceed with the conversation, using templates and examples as appropriate." }]
          });
          
          contents.push({
            role: 'model' as const,
            parts: [{ text: "I'm ready to have our conversation, keeping these templates and examples in mind." }]
          });
        }
        
        // Then add the conversation up to this point
        const conversationContents = truncatedMessages.map(msg => ({
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
    resizingRef.current.isResizing = false;
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
              <a href="/" className="text-lg font-semibold tracking-tight text-foreground">
                Few-Shot Chatbot
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
              <h2 className="text-xl font-semibold tracking-tight">Examples</h2>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium">
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add Example
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg">
                  <DropdownMenuItem 
                    onClick={() => addNewExample('input-output')}
                    className="cursor-pointer rounded-lg"
                  >
                    Input-Output
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => addNewExample('name-content')}
                    className="cursor-pointer rounded-lg"
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
                  <div key={index} className="border rounded-2xl p-5 bg-card text-card-foreground shadow-sm">
                    <div className="flex justify-between mb-3">
                      <div className="font-medium text-sm text-muted-foreground flex items-center">
                        <span>Example {index + 1}</span>
                        <div className="ml-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 flex items-center gap-1 px-2.5 text-xs font-normal rounded-full"
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
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground rounded-full" 
                        onClick={() => removeExample(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-sm">
                      <div className="mb-3">
                        <span className="font-medium">{labels.first}:</span>{" "}
                        {editingIndex === index && editingField === 'firstField' ? (
                          <div className="flex items-start mt-2">
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
                                className="h-7 w-7 p-0 mb-1.5 text-green-500 rounded-full" 
                                onClick={saveEdit}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-muted-foreground rounded-full" 
                                onClick={cancelEdit}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span 
                            className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-2 py-0.5 rounded-md max-h-[500px] overflow-y-auto block mt-1 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                            onClick={() => startEditing(index, 'firstField')}
                          >
                            {example.firstField || "Click to add content..."}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">{labels.second}:</span>{" "}
                        {editingIndex === index && editingField === 'secondField' ? (
                          <div className="flex items-start mt-2">
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
                                className="h-7 w-7 p-0 mb-1.5 text-green-500 rounded-full" 
                                onClick={saveEdit}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-muted-foreground rounded-full" 
                                onClick={cancelEdit}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span 
                            className="cursor-pointer hover:bg-accent hover:text-accent-foreground px-2 py-0.5 rounded-md max-h-[500px] overflow-y-auto block mt-1 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                            onClick={() => startEditing(index, 'secondField')}
                          >
                            {example.secondField || "Click to add content..."}
                          </span>
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
              <h2 className="text-xl font-semibold tracking-tight">Templates</h2>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium"
                onClick={addTemplate}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add Template
              </Button>
            </div>
            
            {/* Template list */}
            <div className="space-y-4 mb-6">
              {templates.map((template, index) => (
                <div key={template.id} className="border rounded-lg p-5 bg-card text-card-foreground shadow-sm relative">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm text-muted-foreground font-medium">Template</h3>
                    <Button 
                      variant="ghost"
                      size="sm" 
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-full" 
                      onClick={() => removeTemplate(index)}
                      title="Delete template"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  
                  <div 
                    className="overflow-y-auto mb-4 rounded-lg p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
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
                              <div className="flex items-center gap-1 group">
                                <span 
                                  className="font-medium cursor-pointer"
                                  onClick={() => startEditingDescription(index, idx)}
                                  title="Click to edit description"
                                >
                                  {input.description || "Click to add description"}:
                                </span>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                                  onClick={() => startEditingDescription(index, idx)}
                                >
                                  <svg 
                                    width="12" 
                                    height="12" 
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
                            className="w-full p-2 text-sm border rounded-md bg-background resize-none min-h-[80px]"
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
                        className="h-8 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
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
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex justify-center items-center hover:bg-border/30 rounded-b-lg" 
                    onMouseDown={(e) => startResizing(e, template.id, templateHeights[template.id] || 300)}
                    title="Drag to resize"
                  >
                    <div className="w-16 h-1 bg-border/50 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          {/* Chat messages */}
          <section className="mb-48" id="chat">
            <h2 className="text-xl font-semibold tracking-tight mb-4">Conversation</h2>
            <div className="overflow-y-auto space-y-4 mb-16 rounded-2xl border p-5 bg-card/30 backdrop-blur-sm min-h-[300px] max-h-[500px]">
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
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary text-secondary-foreground'
                      } shadow-sm`}
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
                            className="flex-1 p-2 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
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
                        <div 
                          className="whitespace-pre-wrap cursor-pointer hover:bg-opacity-90 transition-colors"
                          onClick={() => startEditingMessage(index)}
                        >
                          {message.content}
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
        <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-none border-t border-border/30 py-6 pb-16">
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
                className="w-full resize-none overflow-y-auto bg-background text-foreground rounded-2xl min-h-[60px] max-h-[180px] py-3 px-4 border-border focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                style={{ 
                  height: textareaRef.current?.scrollHeight 
                    ? `${Math.min(textareaRef.current.scrollHeight, 180)}px` 
                    : '60px' 
                }}
              />
            </div>
            <Button 
              onClick={handleSendMessage} 
              disabled={isLoading} 
              className="rounded-full h-12 w-12 p-0 flex items-center justify-center flex-shrink-0"
            >
              <SendIcon className="h-5 w-5" />
            </Button>
            <Button 
              variant="outline" 
              onClick={clearChat} 
              className="rounded-full h-12 px-5 text-sm font-medium flex-shrink-0"
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
