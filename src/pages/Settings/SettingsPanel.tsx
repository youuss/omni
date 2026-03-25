import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  checkClaudeAvailable,
  FULL_COMMAND_LOG_STORAGE_KEY,
} from '../../services/claude/claude-runner';
import {
  applyMaxTurnsPreset,
  loadAllAgentConfigs,
  type AgentConfig,
} from '../../services/claude/agent-config-service';
import { RefreshCw, CheckCircle, XCircle, Terminal } from 'lucide-react';

const AGENT_NAMES = ['Planner', 'Implementer', 'Verifier'] as const;

interface SettingsPanelProps {
  projectPath: string | undefined;
}

export default function SettingsPanel({ projectPath }: SettingsPanelProps) {
  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [claudeVersion, setClaudeVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkLogs, setCheckLogs] = useState<string[]>([]);

  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentConfig> | null>(null);
  const [agentConfigsLoading, setAgentConfigsLoading] = useState(false);
  const [presetApplying, setPresetApplying] = useState(false);
  const [showFullCommand, setShowFullCommand] = useState(false);

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

  const loadConfigs = async (pp: string) => {
    setAgentConfigsLoading(true);
    try { setAgentConfigs(await loadAllAgentConfigs(pp)); }
    catch { setAgentConfigs(null); }
    finally { setAgentConfigsLoading(false); }
  };

  useEffect(() => { checkEnv(); }, []);

  useEffect(() => {
    try { setShowFullCommand(window.localStorage.getItem(FULL_COMMAND_LOG_STORAGE_KEY) === '1'); }
    catch { setShowFullCommand(false); }
  }, []);

  useEffect(() => {
    if (projectPath) loadConfigs(projectPath);
    else setAgentConfigs(null);
  }, [projectPath]);

  const handleToggleFullCommand = (checked: boolean) => {
    setShowFullCommand(checked);
    try { window.localStorage.setItem(FULL_COMMAND_LOG_STORAGE_KEY, checked ? '1' : '0'); }
    catch { /* ignore */ }
  };

  const handleApplyPreset = async (preset: 'default' | 'low-rate-limit') => {
    if (!projectPath) return;
    setPresetApplying(true);
    try {
      await applyMaxTurnsPreset(projectPath, preset);
      await loadConfigs(projectPath);
      toast.success(preset === 'low-rate-limit' ? 'Low rate-limit preset applied' : 'Default preset restored');
    } catch (e) { toast.error(`Preset failed: ${e}`); }
    finally { setPresetApplying(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Environment</p>
            <Button variant="ghost" size="icon-xs" disabled={checking} onClick={checkEnv}>
              <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Claude CLI</span>
              {claudeOk === null ? (
                <Badge variant="secondary" className="text-[10px] h-5">Checking...</Badge>
              ) : claudeOk ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="gap-1 text-[10px] h-5"><CheckCircle className="w-2.5 h-2.5" />Installed</Badge>
                  {claudeVersion && <span className="text-[10px] text-muted-foreground">{claudeVersion}</span>}
                </div>
              ) : (
                <Badge variant="destructive" className="gap-1 text-[10px] h-5"><XCircle className="w-2.5 h-2.5" />Not found</Badge>
              )}
            </div>
            {checkLogs.length > 0 && (
              <div className="rounded-lg bg-zinc-950 p-2.5 font-mono text-[10px] text-zinc-300 space-y-0.5">
                <div className="flex items-center gap-1 text-zinc-500 mb-1"><Terminal className="w-2.5 h-2.5" /><span>Detection log</span></div>
                {checkLogs.map((log, i) => <div key={i} className="leading-4 whitespace-pre-wrap">{log}</div>)}
              </div>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">Show full commands</span>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={showFullCommand} onChange={(e) => handleToggleFullCommand(e.target.checked)} className="rounded" />
                Show [command:full]
              </label>
            </div>
          </div>
        </div>

        {projectPath && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Agent Config</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="xs" className="text-[10px] h-6" disabled={agentConfigsLoading || presetApplying} onClick={() => handleApplyPreset('low-rate-limit')}>Low Rate</Button>
                <Button variant="ghost" size="xs" className="text-[10px] h-6" disabled={agentConfigsLoading || presetApplying} onClick={() => handleApplyPreset('default')}>Default</Button>
                <Button variant="ghost" size="icon-xs" disabled={agentConfigsLoading || presetApplying} onClick={() => loadConfigs(projectPath)}>
                  <RefreshCw className={`w-3 h-3 ${agentConfigsLoading || presetApplying ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            {agentConfigsLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
            ) : (
              <div className="space-y-2">
                {AGENT_NAMES.map((name) => {
                  const config = agentConfigs?.[name];
                  return (
                    <div key={name} className="glass-card rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold">{name}</span>
                        <span className="text-[10px] text-muted-foreground">max {config?.maxTurns ?? '—'} turns</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {(config?.allowedTools ?? []).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">Harness Workflow</p>
          <div className="space-y-1.5">
            {[
              { name: 'Planner', desc: 'Analyzes requirements, generates development plan' },
              { name: 'Implementer', desc: 'Implements code according to the plan' },
              { name: 'Verifier', desc: 'Verifies implementation meets requirements' },
            ].map((item) => (
              <div key={item.name} className="flex gap-2 text-[11px]">
                <span className="font-medium text-muted-foreground w-20 shrink-0">{item.name}</span>
                <span className="text-muted-foreground/70">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
