import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Shield, FileText, Code2, ClipboardCheck, Search,
  Trash2, Save, Pencil, X, Check, Loader2, AlertTriangle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHarnessStore } from '../../stores/harnessStore';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import type { AgentDefinition, FileTab, NodeStatus } from '../../types/harness';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  planner: FileText,
  implementer: Code2,
  verifier: ClipboardCheck,
  reviewer: Search,
  custom: Bot,
};

const STATUS_CONFIG: Record<NodeStatus, { icon: React.ElementType; label: string; cls: string }> = {
  idle: { icon: Clock, label: 'Ready', cls: 'text-muted-foreground/50 bg-muted/30' },
  waiting: { icon: Clock, label: 'Waiting', cls: 'text-muted-foreground bg-muted/40' },
  running: { icon: Loader2, label: 'Running', cls: 'text-blue-600 bg-blue-50/60' },
  success: { icon: Check, label: 'Success', cls: 'text-emerald-600 bg-emerald-50/60' },
  failure: { icon: AlertTriangle, label: 'Failed', cls: 'text-destructive bg-red-50/60' },
  skipped: { icon: X, label: 'Skipped', cls: 'text-muted-foreground/40 bg-muted/20' },
};

interface NodeDetailPanelProps {
  nodeId: string;
  agent: AgentDefinition | undefined;
  tabs: FileTab[];
  documents: Record<string, string>;
  editingTabId: string | null;
  isRunning: boolean;
  onEditingChange: (tabId: string | null) => void;
  onDocumentChange: (tabId: string, content: string) => void;
  onSaveDocument: (tabId: string) => void;
}

export default function NodeDetailPanel({
  nodeId,
  agent,
  tabs: allTabs,
  documents,
  editingTabId,
  isRunning,
  onEditingChange,
  onDocumentChange,
  onSaveDocument,
}: NodeDetailPanelProps) {
  const { currentHarness, nodeStates, removeNode } = useHarnessStore();
  const node = currentHarness?.nodes.find((n) => n.id === nodeId);
  const state = nodeStates[nodeId];
  const status = state?.status ?? 'idle';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const StatusIcon = statusCfg.icon;

  const nodeTabs = allTabs.filter((t) => t.nodeId === nodeId);

  if (!node || !agent) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-xs text-muted-foreground/50">Node not found</p>
      </div>
    );
  }

  const Icon = agent.builtin ? Shield : (CATEGORY_ICONS[agent.category] ?? Bot);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {/* Agent Header */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
              agent.builtin ? 'bg-primary/8 text-primary' : 'bg-blue-500/10 text-blue-600'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight">{agent.name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                {agent.category}
              </Badge>
              {agent.builtin && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  built-in
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{agent.description}</p>
        )}

        {/* Status */}
        <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', statusCfg.cls)}>
          <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', status === 'running' && 'animate-spin')} />
          <span className="text-[11px] font-medium">{statusCfg.label}</span>
          {state?.error && (
            <span className="text-[10px] opacity-80 truncate ml-auto">{state.error}</span>
          )}
        </div>

        {/* Files */}
        {nodeTabs.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-1.5">Files</p>
            <div className="space-y-1.5">
              {nodeTabs.map((tab) => {
                const content = documents[tab.id] ?? '';
                const isEditing = editingTabId === tab.id;
                const hasContent = content.trim().length > 0;

                return (
                  <div key={tab.id} className="rounded-lg border border-border/25 overflow-hidden">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/40">
                      <FileText className="w-3 h-3 text-muted-foreground/35 shrink-0" />
                      <span className="text-[11px] font-medium flex-1 truncate">{tab.label}</span>
                      {!hasContent && !isEditing && (
                        <span className="text-[9px] text-muted-foreground/30">empty</span>
                      )}
                      {tab.editable && !isEditing && (
                        <button
                          onClick={() => onEditingChange(tab.id)}
                          className="p-0.5 rounded text-muted-foreground/30 hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="px-2.5 pb-2.5 pt-1">
                        <Textarea
                          value={content}
                          onChange={(e) => onDocumentChange(tab.id, e.target.value)}
                          placeholder={`Enter ${tab.label}...`}
                          className="text-xs font-mono min-h-[80px] border-border/20"
                        />
                        <div className="flex gap-1.5 mt-2">
                          <Button size="xs" className="gap-1 h-6 text-[10px] cursor-pointer" onClick={() => onSaveDocument(tab.id)}>
                            <Save className="w-2.5 h-2.5" /> Save
                          </Button>
                          <Button variant="ghost" size="xs" className="h-6 text-[10px] cursor-pointer" onClick={() => onEditingChange(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : hasContent ? (
                      <div className="px-2.5 pb-2.5 pt-1 max-h-[200px] overflow-auto border-t border-border/15">
                        <MarkdownRenderer content={content} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Remove */}
        <div className="pt-1">
          <button
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer disabled:opacity-30"
            onClick={() => removeNode(nodeId)}
            disabled={isRunning}
          >
            <Trash2 className="w-3 h-3" />
            Remove node
          </button>
        </div>
      </div>
    </ScrollArea>
  );
}
