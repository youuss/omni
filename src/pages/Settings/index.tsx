import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Terminal,
  FolderOpen,
} from 'lucide-react';
import type { AgentName } from '../../types';

const AGENT_NAMES: AgentName[] = ['Planner', 'Implementer', 'Verifier', 'Analyzer'];

export default function SettingsPage() {
  const { currentProject } = useProjectStore();

  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [claudeVersion, setClaudeVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [checkLogs, setCheckLogs] = useState<string[]>([]);

  const [agentConfigs, setAgentConfigs] = useState<Record<
    AgentName,
    AgentConfig
  > | null>(null);
  const [agentConfigsLoading, setAgentConfigsLoading] = useState(false);
  const [presetApplying, setPresetApplying] = useState(false);
  const [showFullCommand, setShowFullCommand] = useState(false);

  const [activeSection, setActiveSection] = useState<'agents' | 'environment'>(
    'agents'
  );

  const checkEnv = async () => {
    setChecking(true);
    setClaudeOk(null);
    try {
      const result = await checkClaudeAvailable();
      setClaudeOk(result.ok);
      setClaudeVersion(result.version);
      setCheckLogs(result.logs);
    } finally {
      setChecking(false);
    }
  };

  const loadAgentConfigs = async (projectPath: string) => {
    setAgentConfigsLoading(true);
    try {
      const configs = await loadAllAgentConfigs(projectPath);
      setAgentConfigs(configs);
    } catch {
      setAgentConfigs(null);
    } finally {
      setAgentConfigsLoading(false);
    }
  };

  useEffect(() => {
    checkEnv();
  }, []);

  useEffect(() => {
    try {
      setShowFullCommand(
        window.localStorage.getItem(FULL_COMMAND_LOG_STORAGE_KEY) === '1'
      );
    } catch {
      setShowFullCommand(false);
    }
  }, []);

  useEffect(() => {
    if (currentProject?.path) {
      loadAgentConfigs(currentProject.path);
    } else {
      setAgentConfigs(null);
    }
  }, [currentProject?.path]);

  const handleToggleFullCommand = (checked: boolean) => {
    setShowFullCommand(checked);
    try {
      window.localStorage.setItem(
        FULL_COMMAND_LOG_STORAGE_KEY,
        checked ? '1' : '0'
      );
    } catch {
      // ignore
    }
  };

  const handleApplyPreset = async (preset: 'default' | 'low-rate-limit') => {
    if (!currentProject?.path) return;
    setPresetApplying(true);
    try {
      await applyMaxTurnsPreset(currentProject.path, preset);
      await loadAgentConfigs(currentProject.path);
      toast.success(
        preset === 'low-rate-limit' ? '已应用低限流预设' : '已恢复默认预设'
      );
    } catch (e) {
      toast.error(`预设应用失败: ${e}`);
    } finally {
      setPresetApplying(false);
    }
  };

  return (
    <div className="p-8 max-w-[960px] mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理环境配置和 Agent 参数。
        </p>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 mb-6">
        {[
          { key: 'agents' as const, label: 'Agent 配置' },
          { key: 'environment' as const, label: '环境检查' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`relative px-4 py-2.5 text-xs font-medium transition-all duration-200 ${
              activeSection === key
                ? 'text-foreground'
                : 'text-muted-foreground/70 hover:text-foreground'
            }`}
          >
            {label}
            {activeSection === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ══════ Agents Section ══════ */}
      {activeSection === 'agents' && (
        <>
          <div className="glass-card rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
                  Agent 配置
                </p>
                <p className="text-lg font-semibold">
                  {currentProject?.name ?? '—'}
                </p>
                {currentProject ? (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    修改{' '}
                    <code className="bg-muted px-1 rounded text-[11px]">
                      .omni/agents/*.json
                    </code>{' '}
                    自定义
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    请先打开一个项目
                  </p>
                )}
              </div>
              {currentProject && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={agentConfigsLoading || presetApplying}
                    onClick={() => handleApplyPreset('low-rate-limit')}
                  >
                    应用低限流预设
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={agentConfigsLoading || presetApplying}
                    onClick={() => handleApplyPreset('default')}
                  >
                    恢复默认
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={agentConfigsLoading || presetApplying}
                    onClick={() =>
                      currentProject && loadAgentConfigs(currentProject.path)
                    }
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        agentConfigsLoading || presetApplying
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {!currentProject ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无项目
            </p>
          ) : agentConfigsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              加载中...
            </p>
          ) : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Agent</TableHead>
                    <TableHead>允许的工具</TableHead>
                    <TableHead className="w-[80px]">最大轮次</TableHead>
                    <TableHead className="w-[100px]">系统提示</TableHead>
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
                            {(config?.allowedTools ?? []).map((t) => (
                              <Badge
                                key={t}
                                variant="secondary"
                                className="text-[10px] h-5"
                              >
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{config?.maxTurns ?? '—'}</TableCell>
                        <TableCell>
                          {config?.systemPrompt ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5"
                            >
                              已配置
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5"
                            >
                              默认
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* SDD 工作流说明 */}
          <div className="glass-card rounded-2xl p-6 mt-6">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">
              SDD 工作流说明
            </p>
            <div className="space-y-2.5">
              {[
                {
                  name: 'Planner',
                  desc: '分析需求文档，生成开发规划 (dev-plan.md)',
                },
                { name: 'Implementer', desc: '根据开发规划实现代码，写入项目' },
                {
                  name: 'Verifier',
                  desc: '验证实现是否符合规划要求，生成验证报告',
                },
              ].map((item) => (
                <div key={item.name} className="flex gap-3 text-sm">
                  <span className="font-medium text-muted-foreground w-28 shrink-0">
                    {item.name}
                  </span>
                  <span>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════ Environment Section ══════ */}
      {activeSection === 'environment' && (
        <div className="glass-card rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">
                环境检查
              </p>
              <p className="text-lg font-semibold">运行环境</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={checking}
              onClick={checkEnv}
              className="gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`}
              />
              重新检测
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Claude CLI</span>
              {claudeOk === null ? (
                <Badge variant="secondary">检测中...</Badge>
              ) : claudeOk ? (
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="w-3 h-3" />
                    已安装
                  </Badge>
                  {claudeVersion && (
                    <span className="text-xs text-muted-foreground">
                      {claudeVersion}
                    </span>
                  )}
                </div>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  未检测到
                </Badge>
              )}
            </div>
            {checkLogs.length > 0 && (
              <div className="rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300 space-y-0.5">
                <div className="flex items-center gap-1.5 text-zinc-500 mb-1.5">
                  <Terminal className="w-3 h-3" />
                  <span>检测日志</span>
                </div>
                {checkLogs.map((log, i) => (
                  <div key={i} className="leading-5 whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">
                Agent 配置目录
              </span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                {'{project}'}/.omni/agents/
              </code>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">规格目录</span>
              <span className="text-xs text-muted-foreground">
                .specs/ (每个项目根目录下)
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                输出完整 Claude 命令
              </span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFullCommand}
                  onChange={(e) => handleToggleFullCommand(e.target.checked)}
                  className="rounded"
                />
                在输出面板显示 [command:full]
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
