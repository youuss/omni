import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { HarnessInput } from '@/types/harness';

interface InputPanelProps {
  inputs: HarnessInput[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  isRunning: boolean;
}

export function InputPanel({ inputs, values, onChange, isRunning }: InputPanelProps) {
  const [editingInput, setEditingInput] = useState<string | null>(
    inputs.length > 0 ? inputs[0].name : null
  );

  if (!inputs || inputs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No inputs defined for this harness. Add inputs in the harness settings.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Input tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
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
            {input.required && <span className="text-red-500">*</span>}
          </button>
        ))}
      </div>

      {/* Active input editor */}
      <div className="flex-1 overflow-hidden">
        {editingInput ? (
          <textarea
            className="w-full h-full p-3 bg-transparent text-sm font-mono resize-none focus:outline-none"
            value={values[editingInput] || ''}
            onChange={(e) => onChange(editingInput, e.target.value)}
            placeholder={inputs.find((i) => i.name === editingInput)?.description || `Enter ${editingInput}...`}
            disabled={isRunning}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an input to edit
          </div>
        )}
      </div>
    </div>
  );
}
