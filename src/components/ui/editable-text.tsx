import { useState } from "react";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { Input } from "./input";
import { Check, X } from "lucide-react";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  onStartEditing?: () => void;
  className?: string;
}

export function EditableText({
  value,
  onChange,
  label,
  placeholder = "Click to add content...",
  multiline = true,
  onStartEditing,
  className = "",
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const startEditing = () => {
    setIsEditing(true);
    setEditValue(value);
    onStartEditing?.();
  };

  const saveEdit = () => {
    if (editValue.trim() || value) {
      onChange(editValue);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return (
    <div className={`mb-3 ${className}`}>
      {/* Optional Label */}
      {label && (
        <div className="flex items-baseline mb-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className="flex-grow ml-2 border-t border-dashed border-border/30"></div>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing ? (
        <div className="flex items-start mt-1.5">
          {multiline ? (
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 p-3 border rounded-xl text-sm bg-background text-foreground focus:outline-none focus:border-border focus:ring-0 scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border/70"
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1"
              placeholder={placeholder}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          )}
          <div className="flex flex-col ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 mb-1.5 text-green-500 rounded-full transition-colors duration-200"
              onClick={saveEdit}
              title="Save"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground rounded-full transition-colors duration-200"
              onClick={cancelEdit}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div 
          className="cursor-pointer group hover:bg-primary/5 hover:text-primary px-3 py-2 rounded-lg border border-transparent hover:border-border/30 max-h-[500px] overflow-y-auto block mt-1 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-border/50 scrollbar-track-transparent hover:scrollbar-thumb-border/70 transition-all duration-150 relative"
          onClick={startEditing}
        >
          {value || <span className="italic text-muted-foreground/70">{placeholder}</span>}
          <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-100 transition-opacity">
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
          </div>
        </div>
      )}
    </div>
  );
} 