import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Pencil,
  Save,
  Zap,
  FileText,
  Code2,
  ClipboardCheck,
  Search,
  Bot,
} from 'lucide-react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import type { FileTab, AgentCategory } from '../../types/harness';

const CATEGORY_ICONS: Record<AgentCategory, React.ElementType> = {
  planner: FileText,
  implementer: Code2,
  verifier: ClipboardCheck,
  reviewer: Search,
  custom: Bot,
};

interface ContentTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: FileTab[];
  documents: Record<string, string>;
  editingTabId: string | null;
  isRunning: boolean;
  onEditingChange: (tabId: string | null) => void;
  onDocumentChange: (tabId: string, content: string) => void;
  onSaveDocument: (tabId: string) => void;
  onRunHarness: () => void;
}

export default function ContentTabs({
  activeTab,
  onTabChange,
  tabs,
  documents,
  editingTabId,
  isRunning,
  onEditingChange,
  onDocumentChange,
  onSaveDocument,
  onRunHarness,
}: ContentTabsProps) {
  if (tabs.length === 0) {
    return (
      <div className="glass-card rounded-2xl flex items-center justify-center h-full">
        <div className="text-center px-8">
          <FileText className="w-10 h-10 text-muted-foreground/20 mb-3 mx-auto" />
          <p className="text-sm text-muted-foreground">No file tabs</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Design a harness first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl flex flex-col h-full overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-col h-full"
      >
        <div className="border-b border-border/30 px-4 shrink-0">
          <TabsList variant="line" className="h-auto p-0 gap-0">
            {tabs.map((tab) => {
              const Icon = CATEGORY_ICONS[tab.agentCategory] ?? FileText;
              const hasContent = !!(documents[tab.id]?.trim());
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="rounded-none border-none! shadow-none! px-4 py-2.5 text-xs gap-1.5 after:bg-primary! cursor-pointer"
                >
                  <Icon className="w-3 h-3" />
                  {tab.label}
                  {hasContent && <span className="w-1.5 h-1.5 rounded-full bg-primary ml-1" />}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0 h-full">
              <TabPanel
                tab={tab}
                content={documents[tab.id] ?? ''}
                isEditing={editingTabId === tab.id}
                isRunning={isRunning}
                onEdit={() => onEditingChange(tab.id)}
                onCancelEdit={() => onEditingChange(null)}
                onContentChange={(val) => onDocumentChange(tab.id, val)}
                onSave={() => onSaveDocument(tab.id)}
                onRunHarness={onRunHarness}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

interface TabPanelProps {
  tab: FileTab;
  content: string;
  isEditing: boolean;
  isRunning: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onContentChange: (val: string) => void;
  onSave: () => void;
  onRunHarness: () => void;
}

function TabPanel({
  tab,
  content,
  isEditing,
  isRunning,
  onEdit,
  onCancelEdit,
  onContentChange,
  onSave,
  onRunHarness,
}: TabPanelProps) {
  const Icon = CATEGORY_ICONS[tab.agentCategory] ?? FileText;

  if (tab.editable && isEditing) {
    return (
      <div className="flex flex-col h-full">
        <Textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={`Enter ${tab.label} content (Markdown)...`}
          className="flex-1 min-h-0 font-mono text-xs border-0 rounded-none resize-none focus-visible:ring-0"
        />
        <div className="flex gap-2 px-5 py-3 border-t border-border/20 shrink-0">
          <Button size="sm" className="gap-1.5" onClick={onSave}>
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (content.trim()) {
    return (
      <div className="flex flex-col h-full">
        {tab.editable && (
          <div className="px-5 py-2.5 shrink-0 flex items-center border-b border-border/15">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs cursor-pointer"
              onClick={onEdit}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
          </div>
        )}
        <ScrollArea className="flex-1">
          <div className="p-5">
            <MarkdownRenderer content={content} />
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (tab.editable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <Icon className="w-10 h-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground mb-3">No {tab.label} yet</p>
        <Button variant="outline" onClick={onEdit} className="cursor-pointer">
          Write {tab.label}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <Icon className="w-10 h-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground mb-3">{tab.label} not generated yet</p>
      <Button
        disabled={isRunning}
        className="gap-1.5 cursor-pointer"
        onClick={onRunHarness}
      >
        <Zap className="w-3.5 h-3.5" />
        Execute Harness
      </Button>
    </div>
  );
}
