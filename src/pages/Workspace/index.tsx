import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Empty } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Bot,
  Sparkles,
  Settings,
  Code2,
  Archive,
  Layers,
  ChevronUp,
  ChevronDown,
  Terminal,
  Globe,
  Plus,
  FileText,
  X,
} from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useRunStore } from '../../stores/runStore';
import { useOutputStore } from '../../stores/outputStore';
import { useHarnessStore } from '../../stores/harnessStore';
import { ensureAgentConfigs } from '../../services/claude/agent-config-service';
import * as runService from '../../services/run-service';
import { useRunFiles } from './useRunFiles';
import { useHarnessRunner } from './useHarnessRunner';
import WorkspaceHeader from './WorkspaceHeader';
import HarnessCanvas from './HarnessCanvas';
import CanvasToolbar from './CanvasToolbar';
import OutputStream from './OutputStream';
import { CreateRunDialog } from './WorkspaceDialogs';
import AgentPalette from './AgentPalette';
import NodeDetailPanel from './NodeDetailPanel';
import WorkspaceDrawer, { type DrawerPanel } from './WorkspaceDrawer';

const SIDEBAR_ICONS: { icon: React.ElementType; label: string; key: DrawerPanel }[] = [
  { icon: Layers, label: 'Runs', key: 'runs' },
  { icon: Bot, label: 'Agents', key: 'agents' },
  { icon: Sparkles, label: 'Skills', key: 'skills' },
  { icon: Settings, label: 'Settings', key: 'settings' },
  { icon: Code2, label: 'Codebase', key: 'codebase' },
  { icon: Globe, label: 'Domains', key: 'domains' },
  { icon: Archive, label: 'Archive', key: 'archive' },
];

export default function WorkspacePage() {
  const params = useParams();
  const projectPath = decodeURIComponent(params.projectPath ?? '');

  const { currentProject, openProject, runs, loadRuns } = useProjectStore();
  const {
    currentRunId, isRunning,
    startRun, reset: resetRun,
  } = useRunStore();
  const { clear: clearOutput, lines } = useOutputStore();
  const {
    loadHarness, loadTemplates, harnessRunning, currentHarness,
    tabs, recomputeTabs, templates, agents, selectedNodeId, selectNode,
  } = useHarnessStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showNodeDetail, setShowNodeDetail] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputHeight, setOutputHeight] = useState(200);

  const runFiles = useRunFiles(currentProject?.path, tabs);

  const harness = useHarnessRunner({
    projectPath: currentProject?.path,
    runId: currentRunId,
    onFilesChanged: runFiles.loadFiles,
    onRunsChanged: loadRuns,
  });

  const anyRunning = isRunning || harnessRunning;

  useEffect(() => {
    if (anyRunning && !outputOpen) setOutputOpen(true);
  }, [anyRunning]);

  useEffect(() => {
    resetRun();
    clearOutput();
  }, []);

  useEffect(() => {
    if (projectPath && projectPath !== currentProject?.path) {
      resetRun();
      clearOutput();
      openProject(projectPath);
    }
  }, [projectPath, currentProject?.path, openProject, resetRun, clearOutput]);

  useEffect(() => {
    if (currentProject?.path) {
      ensureAgentConfigs(currentProject.path).catch((e: unknown) => {
        toast.error(`Agent config init failed: ${e}`);
      });
      loadHarness(currentProject.path).catch((e: unknown) => {
        toast.error(`Harness load failed: ${e}`);
      });
      loadTemplates(currentProject.path).catch(() => {});
    }
  }, [currentProject?.path]);

  useEffect(() => { harness.checkClaude(); }, [harness.checkClaude]);

  useEffect(() => {
    if (currentRunId) {
      recomputeTabs(currentRunId);
    }
  }, [currentRunId, currentHarness, recomputeTabs]);

  // When a node is selected, show its detail panel
  useEffect(() => {
    if (selectedNodeId) {
      setShowNodeDetail(true);
    } else {
      setShowNodeDetail(false);
    }
  }, [selectedNodeId]);

  const handleNodeClick = useCallback(() => {
    setShowNodeDetail(true);
  }, []);

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setShowNodeDetail(false);
  }, [selectNode]);

  const handleSelectRun = useCallback(
    async (runId: string) => {
      if (!currentProject) return;
      startRun(runId);
      clearOutput();
      const meta = await runService.readRunMeta(currentProject.path, runId);
      await loadHarness(currentProject.path, meta?.harnessId);
      recomputeTabs(runId);
      await runFiles.loadFiles(runId);
    },
    [currentProject, startRun, clearOutput, loadHarness, runFiles.loadFiles, recomputeTabs]
  );

  const handleCreateRun = useCallback(
    async (runId: string, reqDraft: string, harnessId: string) => {
      if (!currentProject) return;
      try {
        await runService.createRun(currentProject.path, runId);
        await runService.writeRunMeta(currentProject.path, runId, { harnessId });
        if (reqDraft.trim()) {
          await runService.writeRunFile(currentProject.path, runId, 'inputs/requirements.md', reqDraft.trim());
        }
        await loadRuns();
        startRun(runId);
        await loadHarness(currentProject.path, harnessId);
        recomputeTabs(runId);
        await runFiles.loadFiles(runId);
        toast.success('Run created');
      } catch (e) { toast.error(`Create failed: ${e}`); }
    },
    [currentProject, startRun, loadHarness, recomputeTabs, runFiles.loadFiles, loadRuns]
  );

  const handleDeletedRun = useCallback(
    async (deletedId: string) => {
      if (currentRunId === deletedId) resetRun();
      await loadRuns();
    },
    [currentRunId, resetRun, loadRuns]
  );

  const handleArchive = useCallback(async () => {
    if (!currentProject || !currentRunId) return;
    try {
      await runService.archiveRun(currentProject.path, currentRunId);
      resetRun();
      runFiles.clearFiles();
      await loadRuns();
      toast.success('Archived');
    } catch (e) { toast.error(`Archive failed: ${e}`); }
  }, [currentProject, currentRunId, resetRun, runFiles.clearFiles, loadRuns]);

  const handleAbort = useCallback(() => {
    harness.abort();
  }, [harness]);

  const toggleDrawer = (panel: DrawerPanel) => {
    setDrawerPanel((prev) => (prev === panel ? null : panel));
  };

  // Selected agent for node detail
  const selectedAgent = useMemo(() => {
    if (!selectedNodeId || !currentHarness) return undefined;
    const node = currentHarness.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return undefined;
    return agents.find((a) => a.id === node.agentId);
  }, [selectedNodeId, currentHarness, agents]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Empty description="Select a project first" />
      </div>
    );
  }

  const harnessReady = !!currentHarness && currentHarness.nodes.length > 0 && !!currentRunId;

  return (
    <div className="flex h-full">
      {/* Main Area */}
      <div className="flex flex-col flex-1 min-w-0">
        <WorkspaceHeader
          project={currentProject}
          runId={currentRunId}
          claudeAvailable={harness.claudeAvailable}
          runs={runs}
          isRunning={anyRunning}
          harnessReady={harnessReady}
          onSelectRun={handleSelectRun}
          onCreateRun={() => setCreateModalOpen(true)}
          onRunHarness={harness.runHarness}
          onAbort={handleAbort}
          onArchive={handleArchive}
        />

        {/* Canvas Area */}
        <div className="flex-1 min-h-0 relative">
          {/* Canvas is always rendered */}
          <HarnessCanvas
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
          />

          {/* Floating toolbar on canvas - only when run is active */}
          {currentRunId && (
            <CanvasToolbar
              projectPath={currentProject.path}
              isRunning={anyRunning}
              harnessReady={harnessReady}
              onRunHarness={harness.runHarness}
              onAbort={handleAbort}
            />
          )}

          {/* Floating Agent Palette - right side of canvas */}
          {showPalette && (
            <div className="absolute top-3 right-3 bottom-3 w-[240px] z-10 flex flex-col rounded-xl bg-white/85 backdrop-blur-md border border-border/40 shadow-[0_4px_24px_oklch(0_0_0/0.08)] overflow-hidden">
              <div className="flex items-center justify-between px-3 h-9 border-b border-border/30 shrink-0">
                <span className="text-[11px] font-medium text-foreground/70">Agents</span>
                <button
                  onClick={() => setShowPalette(false)}
                  className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <AgentPalette agents={agents} />
              </div>
            </div>
          )}

          {/* Floating Node Detail Panel */}
          {showNodeDetail && selectedNodeId && (
            <div className="absolute top-3 right-3 bottom-3 w-[300px] z-10 flex flex-col rounded-xl bg-white/90 backdrop-blur-md border border-border/40 shadow-[0_4px_24px_oklch(0_0_0/0.08)] overflow-hidden">
              <div className="flex items-center justify-between px-3 h-9 border-b border-border/30 shrink-0">
                <span className="text-[11px] font-medium text-foreground/70">Node Detail</span>
                <button
                  onClick={() => { selectNode(null); setShowNodeDetail(false); }}
                  className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-black/5 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <NodeDetailPanel
                  nodeId={selectedNodeId}
                  agent={selectedAgent}
                  tabs={tabs}
                  documents={runFiles.documents}
                  editingTabId={runFiles.editingTabId}
                  isRunning={anyRunning}
                  onEditingChange={runFiles.setEditingTabId}
                  onDocumentChange={runFiles.updateDocument}
                  onSaveDocument={(tabId) => runFiles.saveDocument(tabId)}
                />
              </div>
            </div>
          )}

          {/* No Run Overlay */}
          {!currentRunId && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px] pointer-events-none">
              <div className="flex flex-col items-center text-center px-8 pointer-events-auto">
                <div className="w-16 h-16 rounded-2xl bg-white/60 backdrop-blur-sm border border-border/30 flex items-center justify-center mb-5 shadow-sm">
                  <FileText className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground/70 mb-1.5">No active run</p>
                <p className="text-xs text-muted-foreground/60 mb-5 max-w-[280px]">
                  Create a run to start executing the harness. You can design the harness topology in the background.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setCreateModalOpen(true)}
                    className="gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Run
                  </Button>
                  {runs.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => setDrawerPanel('runs')}
                      className="gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Select Run
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
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
            <span>Output</span>
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
              <span className="text-[10px] text-muted-foreground">Running</span>
            </div>
          )}
          {outputOpen && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setOutputHeight(Math.min(outputHeight + 80, 500))}
                className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/40 transition-colors cursor-pointer"
                title="Expand"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => setOutputHeight(Math.max(outputHeight - 80, 120))}
                className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-white/40 transition-colors cursor-pointer"
                title="Shrink"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Icon Sidebar */}
      <aside className="w-11 shrink-0 border-l border-border/40 glass flex flex-col items-center py-2 gap-0.5">
        {SIDEBAR_ICONS.map(({ icon: Icon, label, key }) => {
          const isActive = drawerPanel === key;
          const hasIndicator = key === 'runs' && runs.length > 0;
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

      {/* Drawer for runs/extensions/settings/codebase/domains/archive */}
      <WorkspaceDrawer
        activePanel={drawerPanel}
        onClose={() => setDrawerPanel(null)}
        projectPath={currentProject.path}
        runs={runs}
        currentRunId={currentRunId}
        onSelectRun={handleSelectRun}
        onDeletedRun={handleDeletedRun}
      />

      <CreateRunDialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onCreate={handleCreateRun}
        templates={templates}
      />
    </div>
  );
}
