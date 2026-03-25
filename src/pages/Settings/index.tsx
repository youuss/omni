import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  checkClaudeAvailable,
  FULL_COMMAND_LOG_STORAGE_KEY,
} from '../../services/claude/claude-runner';
import {
  applyMaxTurnsPreset,
  loadAllAgentConfigs,
  type AgentConfig,
} from '../../services/claude/agent-config-service';
import { useProjectStore } from '../../stores/projectStore';
import { RefreshCw, CheckCircle, XCircle, Terminal, FolderOpen } from 'lucide-react';

const AGENT_NAMES = ['Planner', 'Implementer', 'Verifier'] as const;

export default function SettingsPage() {
  const { currentProject } = useProjectStore();

  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [claudeVersion, setClaudeVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [checkLogs, setCheckLogs] = useState<string[]>([]);

  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentConfig> | null>(null);
  const [agentConfigsLoading, setAgentConfigsLoading] = useState(false);
  const [presetApplying, setPresetApplying] = useState(false);
  const [showFullCommand, setShowFullCommand] = useState(false);

  const [activeSection, setActiveSection] = useState<'agents' | 'environment'>('agents');

  const checkEnv = async () => {
    setChecking(true);
    setClaudeOk(null);
    try {
      const result = await checkClaudeAvailable();
      setClaudeOk(result.ok);
      setClaudeVersion(result.version);
      setCheckLogs(result.logs);
    } finally { setChecking(false); }
  };

  const loadAgentConfigs = async (projectPath: string) => {
    setAgentConfigsLoading(true);
    try { setAgentConfigs(await loadAllAgentConfigs(projectPath)); }
    catch { setAgentConfigs(null); }
    finally { setAgentConfigsLoading(false); }
  };

  useEffect(() => { checkEnv(); }, []);

  useEffect(() => {
    try { setShowFullCommand(window.localStorage.getItem(FULL_COMMAND_LOG_STORAGE_KEY) === '1'); }
    catch { setShowFullCommand(false); }
  }, []);

  useEffect(() => {
    if (currentProject?.path) loadAgentConfigs(currentProject.path);
    else setAgentConfigs(null);
  }, [currentProject?.path]);

  const handleToggleFullCommand = (checked: boolean) => {
    setShowFullCommand(checked);
    try { window.localStorage.setItem(FULL_COMMAND_LOG_STORAGE_KEY, checked ? '1' : '0'); }
    catch { /* ignore */ }
  };

  const handleApplyPreset = async (preset: 'default' | 'low-rate-limit') => {
    if (!currentProject?.path) return;
    setPresetApplying(true);
    try {
      await applyMaxTurnsPreset(currentProject.path, preset);
      await loadAgentConfigs(currentProject.path);
      toast.success(preset === 'low-rate-limit' ? 'Low rate-limit preset applied' : 'Default preset restored');
    } catch (e) { toast.error(`Preset failed: ${e}`); }
    finally { setPresetApplying(false); }
  };

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage environment and agent configuration.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border/40 mb-6">
        {[
          { key: 'agents' as const, label: 'Agent Config' },
          { key: 'environment' as const, label: 'Environment' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setActiveSection(key)}
            className={`relative px-4 py-2.5 text-xs font-medium transition-all duration-200 ${activeSection === key ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'}`}>
            {label}
            {activeSection === key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
          </button>
        ))}
      </div>

      {activeSection === 'agents' && (
        <>
          <div className="glass-card rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Agent Config</p>
                <p className="text-lg font-semibold">{currentProject?.name ?? '—'}</p>
                {currentProject ? (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    Edit <code className="bg-muted px-1 rounded text-[11px]">.harness/agents/*.json</code> to customize
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Open a project first</p>
                )}
              </div>
              {currentProject && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={agentConfigsLoading || presetApplying} onClick={() => handleApplyPreset('low-rate-limit')}>Low Rate Preset</Button>
                  <Button variant="outline" size="sm" disabled={agentConfigsLoading || presetApplying} onClick={() => handleApplyPreset('default')}>Restore Default</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={agentConfigsLoading || presetApplying} onClick={() => currentProject && loadAgentConfigs(currentProject.path)}>
                    <RefreshCw className={`w-3.5 h-3.5 ${agentConfigsLoading || presetApplying ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {!currentProject ? (
            <p className="text-sm text-muted-foreground text-center py-8">No project</p>
          ) : agentConfigsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Agent</TableHead>
                    <TableHead>Allowed Tools</TableHead>
                    <TableHead className="w-[80px]">Max Turns</TableHead>
                    <TableHead className="w-[100px]">System Prompt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AGENT_NAMES.map((name) => {
                    const config = agentConfigs?.[name];
                    return (
                      <TableRow key={name}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(config?.allowedTools ?? []).map((t) => (<Badge key={t} variant="secondary" className="text-[10px] h-5">{t}</Badge>))}
                          </div>
                        </TableCell>
                        <TableCell>{config?.maxTurns ?? '—'}</TableCell>
                        <TableCell>{config?.systemPrompt ? <Badge variant="secondary" className="text-[10px] h-5">Configured</Badge> : <Badge variant="outline" className="text-[10px] h-5">Default</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="glass-card rounded-2xl p-6 mt-6">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">Harness Workflow</p>
            <div className="space-y-2.5">
              {[
                { name: 'Planner', desc: 'Analyzes requirements, generates development plan (dev-plan.md)' },
                { name: 'Implementer', desc: 'Implements code according to the plan' },
                { name: 'Verifier', desc: 'Verifies implementation meets plan requirements, generates report' },
              ].map((item) => (
                <div key={item.name} className="flex gap-3 text-sm">
                  <span className="font-medium text-muted-foreground w-28 shrink-0">{item.name}</span>
                  <span>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeSection === 'environment' && (
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Environment</p>
              <p className="text-lg font-semibold">Runtime Environment</p>
            </div>
            <Button variant="outline" size="sm" disabled={checking} onClick={checkEnv} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> Re-check
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Claude CLI</span>
              {claudeOk === null ? (
                <Badge variant="secondary">Checking...</Badge>
              ) : claudeOk ? (
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="gap-1"><CheckCircle className="w-3 h-3" />Installed</Badge>
                  {claudeVersion && <span className="text-xs text-muted-foreground">{claudeVersion}</span>}
                </div>
              ) : (
                <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Not found</Badge>
              )}
            </div>
            {checkLogs.length > 0 && (
              <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300 space-y-0.5">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1.5"><Terminal className="w-3 h-3" /><span>Detection log</span></div>
                {checkLogs.map((log, i) => (<div key={i} className="leading-5 whitespace-pre-wrap">{log}</div>))}
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Agent config directory</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{'{project}'}/.harness/agents/</code>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Harness directory</span>
              <span className="text-xs text-muted-foreground">.harness/ (per project root)</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Show full Claude commands</span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={showFullCommand} onChange={(e) => handleToggleFullCommand(e.target.checked)} className="rounded" />
                Show [command:full] in output
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
