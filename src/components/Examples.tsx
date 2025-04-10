import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, X, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Define Example types
export type ExampleType = 'input-output' | 'name-content';

export type Example = {
  type: ExampleType;
  firstField: string;
  secondField: string;
  id: string;
};

// Define labels for different example types
export const exampleTypeLabels: Record<ExampleType, { first: string, second: string }> = {
  'input-output': { first: 'Input', second: 'Output' },
  'name-content': { first: 'Name', second: 'Content' },
};

// Local storage key for examples
export const EXAMPLES_STORAGE_KEY = 'few-shot-chatbot-examples';

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

interface ExamplesProps {
  examples: Example[];
  setExamples: React.Dispatch<React.SetStateAction<Example[]>>;
  activeExampleIds: string[];
  setActiveExampleIds: React.Dispatch<React.SetStateAction<string[]>>;
  showExampleManager: boolean;
  setShowExampleManager: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function Examples({ 
  examples, 
  setExamples, 
  activeExampleIds, 
  setActiveExampleIds,
  showExampleManager,
  setShowExampleManager
}: ExamplesProps) {
  // For example field editing
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'firstField' | 'secondField' | null>(null);
  const [editValue, setEditValue] = useState("");

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

  // Toggle example selection
  const toggleExampleSelection = (exampleId: string) => {
    setActiveExampleIds(prev => {
      if (prev.includes(exampleId)) {
        return prev.filter(id => id !== exampleId);
      } else {
        return [...prev, exampleId];
      }
    });
  };

  // Toggle all examples
  const toggleAllExamples = () => {
    if (activeExampleIds.length === examples.length) {
      // If all examples are selected, deselect all
      setActiveExampleIds([]);
    } else {
      // Otherwise, select all examples
      setActiveExampleIds(examples.map(ex => ex.id));
    }
  };

  // Add a new example
  const addNewExample = (type: ExampleType) => {
    const newExampleId = `example-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newExample: Example = {
      type,
      firstField: "",
      secondField: "",
      id: newExampleId
    };
    setExamples([...examples, newExample]);
    
    // Automatically add new example to active examples
    setActiveExampleIds(prev => [...prev, newExampleId]);
    
    // Put the new example's first field in edit mode
    setEditingIndex(examples.length);
    setEditingField('firstField');
    setEditValue("");
  };

  // Start editing example field
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

  // Remove example
  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index));
  };

  return (
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
      
      {/* Example Manager */}
      {showExampleManager && (
        <div className="mb-4 bg-card/60 backdrop-blur-sm rounded-xl border p-3 animate-in fade-in duration-150 slide-in-from-top-2">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium">Example Selection</div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs rounded-md"
                onClick={toggleAllExamples}
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
                  // Create a default example if none exist
                  addNewExample('input-output');
                  // Scroll to examples section
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
                    onClick={() => toggleExampleSelection(example.id)}
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
    </section>
  );
} 