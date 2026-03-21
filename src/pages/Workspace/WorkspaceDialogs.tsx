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
import type { PipelineTemplateInfo } from '../../types/pipeline';
import { DEFAULT_TEMPLATE_ID } from '../../services/pipeline-template-service';

interface CreateChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, reqDraft: string, pipelineId: string) => void;
  templates?: PipelineTemplateInfo[];
}

export function CreateChangeDialog({
  open,
  onOpenChange,
  onCreate,
  templates = [],
}: CreateChangeDialogProps) {
  const [name, setName] = useState('');
  const [reqDraft, setReqDraft] = useState('');
  const [pipelineId, setPipelineId] = useState(DEFAULT_TEMPLATE_ID);

  const handleClose = () => {
    onOpenChange(false);
    setName('');
    setReqDraft('');
    setPipelineId(DEFAULT_TEMPLATE_ID);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), reqDraft, pipelineId);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新建变更</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium mb-1.5 block">变更名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: user-list-optimization"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">流程模板</label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPipelineId(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                    pipelineId === t.id
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
                {templates.find((t) => t.id === pipelineId)?.description ?? ''}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">
              需求文档（可选，后续可编辑）
            </label>
            <Textarea
              value={reqDraft}
              onChange={(e) => setReqDraft(e.target.value)}
              placeholder="粘贴需求文档内容（Markdown 格式）..."
              className="min-h-[100px] text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
