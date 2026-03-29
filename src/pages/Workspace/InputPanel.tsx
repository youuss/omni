import { useState } from 'react';
import { FileText, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HarnessInput } from '@/types/harness';

interface InputPanelProps {
  inputs: HarnessInput[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  isRunning: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function InputPanel({ inputs, values, onChange, isRunning, onConfirm, onCancel }: InputPanelProps) {
  const [editingInput, setEditingInput] = useState<string | null>(
    inputs.length > 0 ? inputs[0].name : null
  );

  const allRequiredFilled = inputs
    .filter((i) => i.required)
    .every((i) => values[i.name]?.trim());

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs and actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-1">
          {inputs.map((input) => (
            <button
              key={input.name}
              onClick={() => setEditingInput(input.name)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                editingInput === input.name
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <FileText className="w-3 h-3" />
              {input.name}
              {input.required && !values[input.name]?.trim() && (
                <span className="text-red-500">*</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button variant="ghost" size="xs" onClick={onCancel} className="h-6 px-2 text-[11px]">
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          )}
          {onConfirm && (
            <Button
              size="xs"
              onClick={onConfirm}
              disabled={!allRequiredFilled || isRunning}
              className="h-6 px-2.5 text-[11px]"
            >
              <Play className="w-3 h-3 mr-1" />
              Run
            </Button>
          )}
        </div>
      </div>

      {/* Active input editor */}
      <div className="flex-1 overflow-hidden">
        {editingInput ? (
          <div className="flex flex-col h-full">
            {inputs.find((i) => i.name === editingInput)?.description && (
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-white/5">
                {inputs.find((i) => i.name === editingInput)?.description}
                {inputs.find((i) => i.name === editingInput)?.filename && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground/50">
                    → inputs/{inputs.find((i) => i.name === editingInput)?.filename}
                  </span>
                )}
              </div>
            )}
            <textarea
              className="w-full flex-1 p-3 bg-transparent text-sm font-mono resize-none focus:outline-none"
              value={values[editingInput] || ''}
              onChange={(e) => onChange(editingInput, e.target.value)}
              placeholder={`Enter ${editingInput}...`}
              disabled={isRunning}
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an input to edit
          </div>
        )}
      </div>
    </div>
  );
}
