import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Bot, Shield, FileText, Code2, ClipboardCheck, Search, GripVertical,
} from 'lucide-react';
import type { AgentDefinition } from '../../types/harness';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  planner: FileText,
  implementer: Code2,
  verifier: ClipboardCheck,
  reviewer: Search,
  custom: Bot,
};

interface AgentPaletteProps {
  agents: AgentDefinition[];
}

export default function AgentPalette({ agents }: AgentPaletteProps) {
  const handleDragStart = (e: React.DragEvent, agent: AgentDefinition) => {
    e.dataTransfer.setData('application/omni-agent-id', agent.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
        <Bot className="w-8 h-8 text-muted-foreground/20 mb-2" />
        <p className="text-xs text-muted-foreground/50">No agents available</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-1 mb-2">
          Drag to canvas
        </p>
        {agents.map((agent) => {
          const Icon = agent.builtin ? Shield : (CATEGORY_ICONS[agent.category] ?? Bot);
          return (
            <div
              key={agent.id}
              draggable
              onDragStart={(e) => handleDragStart(e, agent)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/30',
                'bg-white/50 hover:bg-white/80 hover:border-border/50 hover:shadow-sm',
                'cursor-grab active:cursor-grabbing transition-all duration-150',
                'select-none group'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-lg shrink-0',
                  agent.builtin ? 'bg-primary/8 text-primary' : 'bg-blue-500/10 text-blue-600'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{agent.name}</p>
                {agent.description && (
                  <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                    {agent.description}
                  </p>
                )}
                <span className="text-[9px] text-muted-foreground/40 mt-1">{agent.category}</span>
              </div>
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/40 shrink-0" />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
