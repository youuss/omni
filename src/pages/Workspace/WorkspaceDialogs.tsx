import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Workflow } from 'lucide-react';
import type { HarnessTemplateInfo } from '../../types/harness';
import { DEFAULT_TEMPLATE_ID } from '../../services/harness-template-service';

interface CreateRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (runId: string, reqDraft: string, harnessId: string) => void;
  templates?: HarnessTemplateInfo[];
}

export function CreateRunDialog({
  open,
  onOpenChange,
  onCreate,
  templates = [],
}: CreateRunDialogProps) {
  const [runId, setRunId] = useState('');
  const [reqDraft, setReqDraft] = useState('');
  const [harnessId, setHarnessId] = useState(DEFAULT_TEMPLATE_ID);

  const handleClose = () => {
    onOpenChange(false);
    setRunId('');
    setReqDraft('');
    setHarnessId(DEFAULT_TEMPLATE_ID);
  };

  const handleCreate = () => {
    if (!runId.trim()) return;
    onCreate(runId.trim(), reqDraft, harnessId);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Run</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Run ID</label>
            <Input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="e.g. user-list-optimization"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">Harness Template</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setHarnessId(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                    harnessId === t.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white/40 border-border/40 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Workflow className="w-3 h-3" />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
            {templates.length > 0 && (
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                {templates.find((t) => t.id === harnessId)?.description ?? ''}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">
              Requirements (optional, editable later)
            </label>
            <Textarea
              value={reqDraft}
              onChange={(e) => setReqDraft(e.target.value)}
              placeholder="Paste requirements content (Markdown)..."
              className="min-h-[100px] text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!runId.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
