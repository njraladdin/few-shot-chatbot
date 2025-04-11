import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, X } from "lucide-react";
import { EditableText } from "@/components/ui/editable-text";
import { Textarea } from "@/components/ui/textarea";

// Define PromptTemplate types
export type PromptTemplate = {
  id: string;
  inputs: TemplateInput[];
};

export type TemplateInput = {
  id: string;
  description: string;
  content: string;
};

// Local storage key for prompt template
export const PROMPT_TEMPLATE_STORAGE_KEY = 'few-shot-chatbot-prompt-template';

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

// Function to create default template
export function createDefaultTemplate(): PromptTemplate {
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

// Function to format template for the API - moved to App.tsx since it's used there
// This is deprecated and will be removed from here
// export const formatPromptTemplate = (template: PromptTemplate): string => {
//   return template.inputs.map(input => {
//     return `${input.description}:\n${input.content}`;
//   }).join('\n\n');
// };

// Custom hook for efficient template management
function usePromptTemplate(
  initialTemplate: PromptTemplate, 
  setParentTemplate: React.Dispatch<React.SetStateAction<PromptTemplate>>
) {
  // Local template state (direct reference, no copying)
  const [template, setTemplate] = useState<PromptTemplate>(initialTemplate);
  
  // Batched updates for parent state
  const pendingUpdatesRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update local template when props change (only if reference changes)
  useEffect(() => {
    if (initialTemplate !== template) {
      setTemplate(initialTemplate);
    }
  }, [initialTemplate]);
  
  // Function to save to localStorage and update parent with delay
  const saveChanges = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set pending flag
    pendingUpdatesRef.current = true;
    
    // Schedule update after delay
    timeoutRef.current = setTimeout(() => {
      // Only update if there are pending changes
      if (pendingUpdatesRef.current) {
        // Update localStorage
        if (isLocalStorageAvailable()) {
          try {
            localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(template));
          } catch (error) {
            console.error("Failed to save prompt template to localStorage:", error);
          }
        }
        
        // Update parent state
        setParentTemplate(template);
        
        // Reset pending flag
        pendingUpdatesRef.current = false;
      }
    }, 800); // Delay updates by 800ms
    
    // Clean up timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [template, setParentTemplate]);
  
  // Trigger save on template change
  useEffect(() => {
    saveChanges();
  }, [template, saveChanges]);
  
  return {
    template,
    setTemplate,
    
    // Template operations
    addInput: useCallback(() => {
      setTemplate(prev => ({
        ...prev,
        inputs: [
          ...prev.inputs, 
          {
            id: `input-${Date.now()}`,
            description: "New input",
            content: ""
          }
        ]
      }));
    }, []),
    
    removeInput: useCallback((inputId: string) => {
      setTemplate(prev => ({
        ...prev,
        inputs: prev.inputs.filter(input => input.id !== inputId)
      }));
    }, []),
    
    updateInput: useCallback((inputId: string, field: 'content' | 'description', value: string) => {
      setTemplate(prev => ({
        ...prev,
        inputs: prev.inputs.map(input => 
          input.id === inputId 
            ? { ...input, [field]: value }
            : input
        )
      }));
    }, [])
  };
}

interface PromptTemplateEditorProps {
  promptTemplate: PromptTemplate;
  setPromptTemplate: React.Dispatch<React.SetStateAction<PromptTemplate>>;
}

// Input component with focused optimization
const TemplateInput = memo(({ 
  input,
  canDelete,
  onContentChange,
  onDescriptionChange,
  onDelete
}: { 
  input: TemplateInput,
  canDelete: boolean,
  onContentChange: (value: string) => void,
  onDescriptionChange: (value: string) => void,
  onDelete: () => void
}) => {
  return (
    <div className="mb-5 text-sm last:mb-1">
      <div className="p-3 group/input relative">
        {/* Description field */}
        <EditableText
          value={input.description}
          onChange={onDescriptionChange}
          multiline={false}
          placeholder="Click to add description..."
          className="mb-2"
        />

        {/* Content field */}
        <div className="mt-1.5">
          <Textarea
            value={input.content}
            onChange={(e) => onContentChange(e.target.value)}
            className="w-full p-3 text-sm bg-background text-foreground resize-none min-h-[80px] max-h-[500px] overflow-y-auto focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border/70 rounded-lg border transition-colors duration-200"
            placeholder="Enter template default value (will be pre-filled when used)..."
          />
        </div>
        
        {/* Delete input button - appears on hover */}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-[-8px] right-[-8px] h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/input:opacity-100 transition-opacity rounded-full z-10"
            onClick={onDelete}
            title="Remove this input"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
});

// Rename the component to clearly indicate it's the editor component
export default function PromptTemplateEditor({
  promptTemplate: parentTemplate,
  setPromptTemplate: setParentTemplate
}: PromptTemplateEditorProps) {
  // Use the custom hook for template management
  const {
    template,
    addInput,
    removeInput,
    updateInput
  } = usePromptTemplate(parentTemplate, setParentTemplate);

  return (
    <section className="mb-6" id="prompt-template-editor">
      <div className="rounded-lg p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200 relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-semibold bg-muted/50 py-1 px-3 rounded-full text-muted-foreground">Prompt Template Editor</h3>
        </div>
        
        <div className="rounded-lg border border-border/30 p-3 bg-card/50">
          {template.inputs.map((input) => (
            <TemplateInput
              key={input.id}
              input={input}
              canDelete={template.inputs.length > 1}
              onContentChange={(value) => updateInput(input.id, 'content', value)}
              onDescriptionChange={(value) => updateInput(input.id, 'description', value)}
              onDelete={() => removeInput(input.id)}
            />
          ))}
          
          {/* Add input button */}
          <div className="flex justify-center mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-all rounded-full px-4 hover:bg-muted/80"
              onClick={addInput}
              title="Add another input field"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Add input</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
} 