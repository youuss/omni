import { Drawer } from '@/components/ui/drawer';
import AgentPanel from '../Agents/AgentPanel';
import ExtensionPanel from '../Extensions/ExtensionPanel';
import SettingsPanel from '../Settings/SettingsPanel';
import CodebaseTree from './CodebaseTree';
import DomainPanel from './DomainPanel';
import ArchivePanel from './ArchivePanel';
import RunList from './RunList';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RunInfo } from '../../types/run';

export type DrawerPanel = 'runs' | 'agents' | 'skills' | 'settings' | 'codebase' | 'domains' | 'archive';

const PANEL_TITLES: Record<DrawerPanel, string> = {
  runs: 'Active Runs',
  agents: 'Agents',
  skills: 'Skills',
  settings: 'Settings',
  codebase: 'Codebase',
  domains: 'Domains',
  archive: 'Archive',
};

interface WorkspaceDrawerProps {
  activePanel: DrawerPanel | null;
  onClose: () => void;
  projectPath: string | undefined;
  runs?: RunInfo[];
  currentRunId?: string | null;
  onSelectRun?: (id: string) => void;
  onDeletedRun?: (id: string) => void;
}

export default function WorkspaceDrawer({
  activePanel,
  onClose,
  projectPath,
  runs = [],
  currentRunId,
  onSelectRun,
  onDeletedRun,
}: WorkspaceDrawerProps) {
  const open = activePanel !== null;
  const width = 380;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={activePanel ? PANEL_TITLES[activePanel] : undefined}
      width={width}
    >
      {activePanel === 'runs' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <RunList
              runs={runs}
              currentRunId={currentRunId ?? null}
              projectPath={projectPath}
              onSelect={(id) => { onSelectRun?.(id); onClose(); }}
              onDeleted={(id) => onDeletedRun?.(id)}
            />
          </div>
        </ScrollArea>
      )}
      {activePanel === 'agents' && (
        <AgentPanel projectPath={projectPath} />
      )}
      {activePanel === 'skills' && <ExtensionPanel projectPath={projectPath} />}
      {activePanel === 'settings' && <SettingsPanel projectPath={projectPath} />}
      {activePanel === 'codebase' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <CodebaseTree projectPath={projectPath} />
          </div>
        </ScrollArea>
      )}
      {activePanel === 'domains' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <DomainPanel projectPath={projectPath} />
          </div>
        </ScrollArea>
      )}
      {activePanel === 'archive' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <ArchivePanel projectPath={projectPath} />
          </div>
        </ScrollArea>
      )}
    </Drawer>
  );
}
