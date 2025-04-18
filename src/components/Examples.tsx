import { memo } from 'react';
import { Button } from "@/components/ui/button";
import { PlusCircle, X, Check, ChevronDown } from "lucide-react";
import { EditableText } from "@/components/ui/editable-text";
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

interface ExamplesProps {
  examples: Example[];
  setExamples: React.Dispatch<React.SetStateAction<Example[]>>;
  activeExampleIds: string[];
  setActiveExampleIds: React.Dispatch<React.SetStateAction<string[]>>;
  showExampleManager: boolean;
  setShowExampleManager: React.Dispatch<React.SetStateAction<boolean>>;
}

// The component implementation
function ExamplesComponent({ 
  examples, 
  setExamples, 
  activeExampleIds, 
  setActiveExampleIds,
  showExampleManager,
  setShowExampleManager
}: ExamplesProps) {
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
    <section className="mb-6" id="examples">
      <div className="flex justify-between items-center mb-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 rounded-full h-8 px-4 text-sm font-medium bg-primary/10 text-primary-foreground/90 border-primary-foreground/20 hover:bg-primary/20 transition-colors ml-auto">
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
      <div className="space-y-5 mb-6">
        {examples.map((example, index) => {
          const labels = exampleTypeLabels[example.type];
          return (
            <div key={index} className="border rounded-xl p-5 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex justify-between mb-4">
                <div className="font-medium text-sm text-muted-foreground flex items-center">
                  <span className="bg-muted/50 text-muted-foreground py-1 px-3 rounded-full text-xs font-semibold">Example {index + 1}</span>
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
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors" 
                  onClick={() => removeExample(index)}
                  title="Delete example"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="border border-border/30 p-3 rounded-lg bg-card/50">
                <div className="text-sm">
                  {/* First field with label */}
                  <EditableText
                    value={example.firstField}
                    onChange={(newValue) => {
                      const updatedExamples = [...examples];
                      updatedExamples[index].firstField = newValue;
                      setExamples(updatedExamples);
                    }}
                    label={labels.first}
                    placeholder="Click to add content..."
                    className="mb-5"
                  />
                  
                  {/* Second field with label */}
                  <EditableText
                    value={example.secondField}
                    onChange={(newValue) => {
                      const updatedExamples = [...examples];
                      updatedExamples[index].secondField = newValue;
                      setExamples(updatedExamples);
                    }}
                    label={labels.second}
                    placeholder="Click to add content..."
                  />
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

// Memoize the component to prevent unnecessary re-renders
const Examples = memo(ExamplesComponent);

// Export the memoized component as default
export default Examples; 