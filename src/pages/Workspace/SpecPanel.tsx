import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import { Empty } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import * as specService from '../../services/spec';
import * as projectService from '../../services/project';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { FileText, Plus } from 'lucide-react';

interface Props {
  projectPath: string;
}

export default function SpecPanel({ projectPath }: Props) {
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [specContent, setSpecContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newSpecContent, setNewSpecContent] = useState('');

  const loadDomains = async () => {
    try {
      const list = await specService.listDomains(projectPath);
      setDomains(list);
    } catch {
      setDomains([]);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [projectPath]);

  const handleSelectDomain = async (domain: string) => {
    setSelectedDomain(domain);
    setEditing(false);
    try {
      const specPath = `${projectPath}/.specs/domains/${domain}/spec.md`;
      const content = await projectService.readTextFile(specPath);
      setSpecContent(content);
    } catch {
      setSpecContent('（规格文件不存在或无法读取）');
    }
  };

  const handleSave = async () => {
    if (!selectedDomain) return;
    try {
      const specPath = `${projectPath}/.specs/domains/${selectedDomain}/spec.md`;
      await projectService.writeTextFile(specPath, editContent);
      setSpecContent(editContent);
      setEditing(false);
      toast.success('已保存');
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    }
  };

  const handleCreateDomain = async () => {
    if (!newDomainName.trim()) return;
    const domainDir = `${projectPath}/.specs/domains/${newDomainName.trim()}`;
    try {
      await projectService.writeTextFile(
        `${domainDir}/spec.md`,
        newSpecContent ||
          `# ${newDomainName.trim()} 规格\n\n## 目的\n\n（请填写该领域的目的描述，至少 50 字）\n\n## 需求\n\n（在此添加需求和场景）\n`
      );
      setCreateModalOpen(false);
      setNewDomainName('');
      setNewSpecContent('');
      await loadDomains();
      toast.success('领域规格已创建');
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    }
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            领域规格
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {domains.length === 0 ? (
          <Empty description="暂无领域规格" className="py-6" />
        ) : (
          <div className="space-y-0.5">
            {domains.map((domain) => (
              <button
                key={domain}
                onClick={() => handleSelectDomain(domain)}
                className={cn(
                  'flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs transition-colors text-left',
                  selectedDomain === domain
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-accent/50'
                )}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{domain}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedDomain && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {selectedDomain}/spec.md
            </p>
            <div className="flex gap-1">
              {editing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={handleSave}
                  >
                    保存
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    setEditing(true);
                    setEditContent(specContent);
                  }}
                >
                  编辑
                </Button>
              )}
            </div>
          </div>
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[200px] font-mono text-xs"
            />
          ) : (
            <ScrollArea className="max-h-[400px]">
              <MarkdownRenderer content={specContent} />
            </ScrollArea>
          )}
        </div>
      )}

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建领域规格</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium mb-1.5 block">
                领域名称
              </label>
              <Input
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                placeholder="例如: user-list, order-detail"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">
                初始内容（可选）
              </label>
              <Textarea
                value={newSpecContent}
                onChange={(e) => setNewSpecContent(e.target.value)}
                placeholder="留空将使用默认模板"
                className="min-h-[100px] text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateDomain}
              disabled={!newDomainName.trim()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
