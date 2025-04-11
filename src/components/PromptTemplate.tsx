import { memo } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, X, GripVertical, Type, TextCursorInput } from "lucide-react";
import { EditableText } from "@/components/ui/editable-text";
import { Textarea } from "@/components/ui/textarea";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';

// Define PromptTemplate types
export type PromptTemplateType = {
  id: string;
  inputs: TemplateInput[];
};

export type TemplateInputType = 'input' | 'text';

export type TemplateInput = {
  id: string;
  type: TemplateInputType;
  content: string;
};

interface PromptTemplateProps {
  promptTemplate: PromptTemplateType;
  setPromptTemplate: React.Dispatch<React.SetStateAction<PromptTemplateType>>;
}

// Sortable Input component with drag functionality
const SortableTemplateInput = memo(({ 
  input,
  canDelete,
  onContentChange,
  onDelete
}: { 
  input: TemplateInput,
  canDelete: boolean,
  onContentChange: (value: string) => void,
  onDelete: () => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: input.id,
    attributes: {
      role: 'button',
      tabIndex: 0, 
    }
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="mb-2 text-sm last:mb-1 group/item"
    >
      <div 
        className={`p-2 pl-4 group/input relative rounded-lg border border-transparent ${isDragging ? 'bg-muted/60 shadow-lg border-border/20' : 'hover:bg-muted/30'} transition-all duration-200`}
      >
        {/* Drag handle */}
        <div 
          {...attributes} 
          {...listeners} 
          className="absolute left-[-8px] top-[50%] transform translate-y-[-50%] p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover/input:opacity-80 hover:opacity-100 transition-opacity"
          data-handle="true"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        
        {/* Content based on type */}
        {input.type === 'input' ? (
          <div 
            className="mb-2" 
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Textarea
              value={input.content}
              onChange={(e) => onContentChange(e.target.value)}
              className="w-full p-2 text-sm bg-background text-foreground resize-none min-h-[60px] max-h-[300px] overflow-y-auto focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border/70 rounded-lg border transition-colors duration-200 cursor-text"
              placeholder="Enter variable content..."
            />
          </div>
        ) : (
          <div 
            className="mb-2" 
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <EditableText
              value={input.content}
              onChange={onContentChange}
              multiline={true}
              placeholder="Enter static text..."
              className="text-sm text-foreground min-h-[1.5em] w-full cursor-text"
            />
          </div>
        )}
        
        {/* Delete input button - appears on hover */}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-[-6px] right-[-6px] h-5 w-5 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/input:opacity-100 transition-opacity rounded-full z-10"
            onClick={onDelete}
            title="Remove this item"
          >
            <X className="h-3 w-3" />
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
  // Set up drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // A bit more forgiving drag distance
        delay: 100, // Slight delay to prevent accidental drags
      },
      // Only activate when clicking on elements with data-handle="true"
      handle: "[data-handle='true']"
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle backward compatibility for templates without type field
  // This ensures existing templates continue to work
  if (promptTemplate.inputs.some(input => !('type' in input))) {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: prev.inputs.map(input => {
        // If it already has a type, return as is
        if ('type' in input) {
          // Remove description if present (since we no longer use it)
          const { description, ...rest } = input as any;
          return rest;
        }
        
        // Otherwise, add type field
        const { description, ...rest } = input as any;
        return {
          ...rest,
          type: 'input' // Default to 'input' type for backward compatibility
        };
      })
    }));
  }

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setPromptTemplate((prev) => {
        const oldIndex = prev.inputs.findIndex((item) => item.id === active.id);
        const newIndex = prev.inputs.findIndex((item) => item.id === over?.id);
        
        return {
          ...prev,
          inputs: arrayMove(prev.inputs, oldIndex, newIndex),
        };
      });
    }
  };

  // Direct operations on the template through the setter
  const addInput = () => {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: [
        ...prev.inputs, 
        {
          id: `input-${Date.now()}`,
          type: 'input',
          content: ""
        }
      ]
    }));
  };
  
  const addText = () => {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: [
        ...prev.inputs, 
        {
          id: `text-${Date.now()}`,
          type: 'text',
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
  
  const updateInput = (inputId: string, value: string) => {
    setPromptTemplate(prev => ({
      ...prev,
      inputs: prev.inputs.map(input => 
        input.id === inputId 
          ? { ...input, content: value }
          : input
      )
    }));
  };

  return (
    <section className="mb-4" id="prompt-template">
      <div className="rounded-lg p-3 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200 relative">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-semibold bg-muted/50 py-1 px-2 rounded-full text-muted-foreground">Prompt Template</h3>
        </div>
        
        <div className="rounded-lg border border-border/30 p-2 bg-card/50 relative">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={promptTemplate.inputs.map(input => input.id)}
              strategy={verticalListSortingStrategy}
            >
              {promptTemplate.inputs.map((input) => (
                <SortableTemplateInput
                  key={input.id}
                  input={input}
                  canDelete={promptTemplate.inputs.length > 1}
                  onContentChange={(value) => updateInput(input.id, value)}
                  onDelete={() => removeInput(input.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          {/* Add buttons */}
          <div className="flex justify-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-all rounded-full px-3 hover:bg-muted/80"
              onClick={addInput}
              title="Add a variable input field"
            >
              <TextCursorInput className="h-3 w-3" />
              <span>Add variable</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-all rounded-full px-3 hover:bg-muted/80"
              onClick={addText}
              title="Add static text content"
            >
              <Type className="h-3 w-3" />
              <span>Add text</span>
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