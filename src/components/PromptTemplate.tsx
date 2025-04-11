import { memo } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, X } from "lucide-react";
import { EditableText } from "@/components/ui/editable-text";
import { Textarea } from "@/components/ui/textarea";

// Define PromptTemplate types
export type PromptTemplateType = {
  id: string;
  inputs: TemplateInput[];
};

export type TemplateInput = {
  id: string;
  description: string;
  content: string;
};

interface PromptTemplateProps {
  promptTemplate: PromptTemplateType;
  setPromptTemplate: React.Dispatch<React.SetStateAction<PromptTemplateType>>;
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

// Function component implementation
function PromptTemplateComponent({
  promptTemplate,
  setPromptTemplate
}: PromptTemplateProps) {
  // Direct operations on the template through the setter
  const addInput = () => {
    setPromptTemplate(prev => ({
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
  };
  
  const removeInput = (inputId: string) => {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: prev.inputs.filter(input => input.id !== inputId)
    }));
  };
  
  const updateInput = (inputId: string, field: 'content' | 'description', value: string) => {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: prev.inputs.map(input => 
        input.id === inputId 
          ? { ...input, [field]: value }
          : input
      )
    }));
  };

  return (
    <section className="mb-6" id="prompt-template">
      <div className="rounded-lg p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200 relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-semibold bg-muted/50 py-1 px-3 rounded-full text-muted-foreground">Prompt Template</h3>
        </div>
        
        <div className="rounded-lg border border-border/30 p-3 bg-card/50">
          {promptTemplate.inputs.map((input) => (
            <TemplateInput
              key={input.id}
              input={input}
              canDelete={promptTemplate.inputs.length > 1}
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

// Memoize the component to prevent unnecessary re-renders
const PromptTemplate = memo(PromptTemplateComponent);

// Export the memoized component as default
export default PromptTemplate; 