import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, X } from "lucide-react";
import { EditableText } from "@/components/ui/editable-text";
import { Textarea } from "@/components/ui/textarea";

// Define Template types
export type Template = {
  id: string;
  inputs: TemplateInput[];
};

export type TemplateInput = {
  id: string;
  description: string;
  content: string;
};

// Local storage key for templates
export const TEMPLATES_STORAGE_KEY = 'few-shot-chatbot-templates';

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
export function createDefaultTemplate(): Template {
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

// Function to format template inputs for API
export const formatTemplateBlocks = (template: Template): string => {
  return template.inputs.map(input => {
    return `${input.description}:\n${input.content}`;
  }).join('\n\n');
};

interface TemplatesProps {
  templates: Template[];
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>;
}

export default function Templates({ 
  templates, 
  setTemplates
}: TemplatesProps) {
  // For template description inline editing
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [editingInputIndex, setEditingInputIndex] = useState<number | null>(null);
  const [editingDescription, setEditingDescription] = useState("");

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

  return (
    <section className="mb-6" id="templates">
      <div className="flex justify-between items-center mb-5">
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium bg-primary/10 text-primary-foreground/90 border-primary-foreground/20 hover:bg-primary/20 transition-colors ml-auto"
          onClick={addTemplate}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Template
        </Button>
      </div>
      
      {/* Template list */}
      <div className="space-y-5 mb-6">
        {templates.map((template, index) => (
          <div key={template.id} className="border rounded-xl p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200 relative">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-semibold bg-muted/50 py-1 px-3 rounded-full text-muted-foreground">Template {index + 1}</h3>
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
            
            <div className="rounded-lg border border-border/30 p-3 bg-card/50">
              {template.inputs.map((input, idx) => (
                <div key={idx} className="mb-5 text-sm last:mb-1">
                  <div className="p-3 group/input relative">
                    {/* Description field */}
                    <EditableText
                      value={input.description}
                      onChange={(newValue) => {
                        const updatedTemplates = [...templates];
                        updatedTemplates[index].inputs[idx].description = newValue;
                        setTemplates(updatedTemplates);
                      }}
                      multiline={false}
                      placeholder="Click to add description..."
                      className="mb-2"
                    />

                    {/* Content field */}
                    <div className="mt-1.5">
                      <Textarea
                        value={input.content}
                        onChange={(e) => {
                          const updatedTemplates = [...templates];
                          updatedTemplates[index].inputs[idx].content = e.target.value;
                          setTemplates(updatedTemplates);
                        }}
                        className="w-full p-3 text-sm bg-background text-foreground resize-none min-h-[80px] max-h-[500px] overflow-y-auto focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border/70 rounded-lg border transition-colors duration-200"
                        placeholder="Enter template default value (will be pre-filled when used)..."
                      />
                    </div>
                    
                    {/* Delete input button - appears on hover */}
                    {template.inputs.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-[-8px] right-[-8px] h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/input:opacity-100 transition-opacity rounded-full z-10"
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
              <div className="flex justify-center mt-2">
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
          </div>
        ))}
      </div>
    </section>
  );
} 