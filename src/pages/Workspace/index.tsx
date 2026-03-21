import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Empty } from '@/components/ui/empty';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  FileText,
  Bot,
  Zap,
  Settings,
  Code2,
  ClipboardCheck,
  Archive,
  Layers,
  ChevronUp,
  ChevronDown,
  Terminal,
} from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useOutputStore } from '../../stores/outputStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { ensureAgentConfigs } from '../../services/claude/agent-config-service';
import * as specService from '../../services/spec';
import { useChangeFiles } from './useChangeFiles';
import { usePipelineRunner } from './usePipelineRunner';
import PipelineBoard from './PipelineBoard';
import WorkspaceHeader from './WorkspaceHeader';
import ContentTabs from './ContentTabs';
import OutputStream from './OutputStream';
import { CreateChangeDialog } from './WorkspaceDialogs';
import PipelineCanvas from './PipelineCanvas';
import WorkspaceDrawer, { type DrawerPanel } from './WorkspaceDrawer';

type MainView = 'content' | 'pipeline';

const RIGHT_ICONS: { icon: React.ElementType; label: string; key: DrawerPanel }[] = [
  { icon: Layers, label: '变更', key: 'changes' },
  { icon: Bot, label: 'Agents', key: 'agents' },
  { icon: Zap, label: 'Skills', key: 'skills' },
  { icon: Settings, label: '设置', key: 'settings' },
  { icon: Code2, label: '代码', key: 'codebase' },
  { icon: ClipboardCheck, label: '规格', key: 'specs' },
  { icon: Archive, label: '归档', key: 'archive' },
];

export default function WorkspacePage() {
  const params = useParams();
  const projectPath = decodeURIComponent(params.projectPath ?? '');

  const { currentProject, openProject, changes, loadChanges } = useProjectStore();
  const {
    changeName, isRunning,
    startChange, reset: resetWorkflow,
  } = useWorkflowStore();
  const { clear: clearOutput, lines } = useOutputStore();
  const {
    loadPipeline, loadTemplates, pipelineRunning, currentPipeline,
    tabs, recomputeTabs, templates,
  } = usePipelineStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('');
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel | null>(null);
  const [mainView, setMainView] = useState<MainView>('content');
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputHeight, setOutputHeight] = useState(240);

  const changeFiles = useChangeFiles(currentProject?.path, tabs);

  const pipeline = usePipelineRunner({
    projectPath: currentProject?.path,
    changeName,
    onFilesChanged: changeFiles.loadFiles,
    onChangesChanged: loadChanges,
  });

  const anyRunning = isRunning || pipelineRunning;

  useEffect(() => {
    if (anyRunning && !outputOpen) setOutputOpen(true);
  }, [anyRunning]);

  // Reset workflow on mount (clear stale changeName from previous session)
  useEffect(() => {
    resetWorkflow();
    clearOutput();
    setMainView('content');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (projectPath && projectPath !== currentProject?.path) {
      resetWorkflow();
      clearOutput();
      setMainView('content');
      openProject(projectPath);
    }
  }, [projectPath, currentProject?.path, openProject, resetWorkflow, clearOutput]);

  useEffect(() => {
    if (currentProject?.path) {
      ensureAgentConfigs(currentProject.path).catch((e: unknown) => {
        toast.error(`Agent 配置初始化失败: ${e}`);
      });
      loadPipeline(currentProject.path).catch((e: unknown) => {
        toast.error(`Pipeline 加载失败: ${e}`);
      });
      loadTemplates(currentProject.path).catch(() => {});
    }
  }, [currentProject?.path]);

  useEffect(() => { pipeline.checkClaude(); }, [pipeline.checkClaude]);

  useEffect(() => {
    if (changeName) {
      recomputeTabs(changeName);
    }
  }, [changeName, currentPipeline, recomputeTabs]);

  useEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.some((t) => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const handleSelectChange = useCallback(
    async (name: string) => {
      if (!currentProject) return;
      startChange(name);
      clearOutput();
      setMainView('content');
      // Load pipeline bound to this change
      const meta = await specService.readChangeMeta(currentProject.path, name);
      await loadPipeline(currentProject.path, meta?.pipelineId);
      recomputeTabs(name);
      await changeFiles.loadFiles(name);
    },
    [currentProject, startChange, clearOutput, loadPipeline, changeFiles.loadFiles, recomputeTabs]
  );

  const handleCreateChange = useCallback(
    async (name: string, reqDraft: string, pipelineId: string) => {
      if (!currentProject) return;
      try {
        await specService.createChange(currentProject.path, name);
        // Save pipeline binding
        await specService.writeChangeMeta(currentProject.path, name, { pipelineId });
        if (reqDraft.trim()) {
          await specService.writeChangeFile(currentProject.path, name, 'requirements.md', reqDraft.trim());
        }
        // Refresh change list first so the new change is recognised
        await loadChanges();
        // Now select the new change
        startChange(name);
        setMainView('content');
        // Load the selected pipeline template
        await loadPipeline(currentProject.path, pipelineId);
        recomputeTabs(name);
        await changeFiles.loadFiles(name);
        toast.success('变更已创建');
      } catch (e) { toast.error(`创建失败: ${e}`); }
    },
    [currentProject, startChange, loadPipeline, recomputeTabs, changeFiles.loadFiles, loadChanges]
  );

  const handleDeletedChange = useCallback(
    async (deletedName: string) => {
      if (changeName === deletedName) resetWorkflow();
      await loadChanges();
    },
    [changeName, resetWorkflow, loadChanges]
  );

  const handleArchive = useCallback(async () => {
    if (!currentProject || !changeName) return;
    try {
      await specService.archiveChange(currentProject.path, changeName);
      resetWorkflow();
      changeFiles.clearFiles();
      await loadChanges();
      toast.success('已归档');
    } catch (e) { toast.error(`归档失败: ${e}`); }
  }, [currentProject, changeName, resetWorkflow, changeFiles.clearFiles, loadChanges]);

  const handleAbort = useCallback(() => {
    pipeline.abort();
  }, [pipeline]);

  const handleOpenPipeline = useCallback(() => {
    setMainView('pipeline');
  }, []);

  const toggleDrawer = (panel: DrawerPanel) => {
    setDrawerPanel((prev) => (prev === panel ? null : panel));
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Empty description="请先选择一个项目" />
      </div>
    );
  }

  const pipelineReady = !!currentPipeline && currentPipeline.nodes.length > 0 && !!changeName;

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <WorkspaceHeader
          project={currentProject}
          changeName={changeName}
          claudeAvailable={pipeline.claudeAvailable}
          changes={changes}
          isRunning={anyRunning}
          pipelineReady={pipelineReady}
          onSelectChange={handleSelectChange}
          onCreateChange={() => setCreateModalOpen(true)}
          onRunPipeline={pipeline.runPipeline}
          onAbort={handleAbort}
          onArchive={handleArchive}
        />

        {mainView === 'pipeline' ? (
          /* Pipeline Canvas — independent of changeName */
          <div className="flex-1 min-h-0">
            <PipelineCanvas
              projectPath={currentProject.path}
              isRunning={anyRunning}
              onRunPipeline={pipeline.runPipeline}
              onAbort={handleAbort}
              onBack={() => setMainView('content')}
            />
          </div>
        ) : changeName ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-5 pt-4 pb-2 shrink-0">
              <PipelineBoard onOpenPipeline={handleOpenPipeline} />
            </div>

            <div className="flex-1 min-h-0 px-5 pb-3">
              <ContentTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={tabs}
                documents={changeFiles.documents}
                editingTabId={changeFiles.editingTabId}
                isRunning={anyRunning}
                onEditingChange={changeFiles.setEditingTabId}
                onDocumentChange={changeFiles.updateDocument}
                onSaveDocument={(tabId) => changeFiles.saveDocument(tabId)}
                onRunPipeline={pipeline.runPipeline}
              />
            </div>

            {/* Bottom Output Panel */}
            <div
              className={cn(
                'shrink-0 border-t border-border/40 transition-all duration-250 ease-in-out overflow-hidden',
                !outputOpen && 'h-0 border-t-0'
              )}
              style={{ height: outputOpen ? outputHeight : 0 }}
            >
              <OutputStream />
            </div>

            {/* Output Toggle Bar */}
            <div className="shrink-0 flex items-center gap-2 px-5 h-8 border-t border-border/30 glass-subtle">
              <button
                onClick={() => setOutputOpen(!outputOpen)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Terminal className="w-3 h-3" />
                <span>Claude 输出</span>
                {lines.length > 0 && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1.5 rounded-full">
                    {lines.length}
                  </span>
                )}
                {outputOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
              {anyRunning && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground">运行中</span>
                </div>
              )}
              {outputOpen && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setOutputHeight(Math.min(outputHeight + 80, 500))}
                    className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/40 transition-colors cursor-pointer"
                    title="增大"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setOutputHeight(Math.max(outputHeight - 80, 120))}
                    className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/40 transition-colors cursor-pointer"
                    title="缩小"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-white/40 backdrop-blur-sm border border-border/30 flex items-center justify-center mb-5">
              <FileText className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground/70 mb-1.5">暂无选中变更</p>
            <p className="text-xs text-muted-foreground/60 mb-4">从右侧面板选择变更，或新建变更开始工作</p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
            >
              + 新建变更
            </button>
          </div>
        )}
      </div>

      {/* Right Icon Sidebar */}
      <aside className="w-11 shrink-0 border-l border-border/40 glass flex flex-col items-center py-2 gap-0.5">
        {RIGHT_ICONS.map(({ icon: Icon, label, key }) => {
          const isActive = drawerPanel === key;
          const hasIndicator = key === 'changes' && changes.length > 0;
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => toggleDrawer(key)}
                    className={cn(
                      'relative flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200 cursor-pointer',
                      isActive
                        ? 'bg-white/70 text-primary shadow-[0_1px_4px_oklch(0.35_0.02_230/0.12)]'
                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-white/40'
                    )}
                  />
                }
              >
                <Icon className="w-4 h-4" />
                {hasIndicator && !isActive && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary/60" />
                )}
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </aside>

      <WorkspaceDrawer
        activePanel={drawerPanel}
        onClose={() => setDrawerPanel(null)}
        projectPath={currentProject.path}
        changes={changes}
        currentChangeName={changeName}
        onSelectChange={handleSelectChange}
        onDeletedChange={handleDeletedChange}
      />

      <CreateChangeDialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreate={handleCreateChange}
        templates={templates}
      />
    </div>
  );
}
