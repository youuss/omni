import { Drawer } from '@/components/ui/drawer';
import AgentPanel from '../Agents/AgentPanel';
import SkillPanel from '../Skills/SkillPanel';
import SettingsPanel from '../Settings/SettingsPanel';
import CodebaseTree from './CodebaseTree';
import SpecPanel from './SpecPanel';
import ArchivePanel from './ArchivePanel';
import ChangeList from './ChangeList';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChangeInfo } from '../../types';

export type DrawerPanel = 'changes' | 'agents' | 'skills' | 'settings' | 'codebase' | 'specs' | 'archive';

const PANEL_TITLES: Record<DrawerPanel, string> = {
  changes: '活跃变更',
  agents: 'Agents',
  skills: 'Skills',
  settings: '设置',
  codebase: '代码浏览',
  specs: '领域规格',
  archive: '历史归档',
};

interface WorkspaceDrawerProps {
  activePanel: DrawerPanel | null;
  onClose: () => void;
  projectPath: string | undefined;
  changes?: ChangeInfo[];
  currentChangeName?: string | null;
  onSelectChange?: (name: string) => void;
  onDeletedChange?: (name: string) => void;
}

export default function WorkspaceDrawer({
  activePanel,
  onClose,
  projectPath,
  changes = [],
  currentChangeName,
  onSelectChange,
  onDeletedChange,
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
      {activePanel === 'changes' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <ChangeList
              changes={changes}
              currentChangeName={currentChangeName ?? null}
              projectPath={projectPath}
              onSelect={(name) => { onSelectChange?.(name); onClose(); }}
              onDeleted={(name) => onDeletedChange?.(name)}
            />
          </div>
        </ScrollArea>
      )}
      {activePanel === 'agents' && (
        <AgentPanel projectPath={projectPath} />
      )}
      {activePanel === 'skills' && <SkillPanel projectPath={projectPath} />}
      {activePanel === 'settings' && <SettingsPanel projectPath={projectPath} />}
      {activePanel === 'codebase' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <CodebaseTree projectPath={projectPath} />
          </div>
        </ScrollArea>
      )}
      {activePanel === 'specs' && projectPath && (
        <ScrollArea className="h-full">
          <div className="p-3">
            <SpecPanel projectPath={projectPath} />
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
