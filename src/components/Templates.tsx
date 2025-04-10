import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PlusCircle, X, Check } from "lucide-react";

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
export const TEMPLATE_HEIGHTS_STORAGE_KEY = 'few-shot-chatbot-template-heights';

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
  templateHeights: Record<string, number>;
  setTemplateHeights: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export default function Templates({ 
  templates, 
  setTemplates,
  templateHeights,
  setTemplateHeights 
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
            
            <div className="overflow-y-auto mb-4 rounded-lg border border-border/30 p-3 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent bg-card/50 max-h-[300px]">
              {template.inputs.map((input, idx) => (
                <div key={idx} className="mb-5 text-sm last:mb-1">
                  <div className="p-3 group/input relative">
                    <div className="mb-3">
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
                        <div className="flex items-baseline gap-1 group mb-2">
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
                      className="w-full p-3 text-sm border rounded-lg bg-background/60 hover:bg-background resize-none min-h-[80px] max-h-[500px] overflow-y-auto focus:outline-none focus:ring-1 focus:ring-border transition-colors duration-200 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent"
                      placeholder="Enter template default value (will be pre-filled when used)..."
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

            <div className="text-xs flex justify-between items-center">
              <span className="text-muted-foreground">
                {template.inputs.length} Input {template.inputs.length === 1 ? 'Field' : 'Fields'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
} 