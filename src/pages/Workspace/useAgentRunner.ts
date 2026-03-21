import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { runAgent, checkClaudeAvailable } from '../../services/claude/claude-runner';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useOutputStore } from '../../stores/outputStore';
import type { AgentRunHandle, AgentName, WorkflowStage } from '../../types';

const AGENT_MAP: Partial<Record<WorkflowStage, AgentName>> = {
  planning: 'Planner',
  implementing: 'Implementer',
  verifying: 'Verifier',
};

function buildPrompt(stage: WorkflowStage, changeName: string, requirements: string): string {
  switch (stage) {
    case 'planning':
      return `请基于以下需求文档生成开发规划，并将规划写入 .specs/active/${changeName}/dev-plan.md。\n\n需求文档内容：\n${requirements}`;
    case 'implementing':
      return `请根据 .specs/active/${changeName}/dev-plan.md 中的开发规划实现代码。完成后将交付清单追加到 dev-plan.md 末尾。`;
    case 'verifying':
      return `请验证 .specs/active/${changeName}/ 中的实现是否符合规划要求。\n阅读 .specs/active/${changeName}/dev-plan.md 获取规划信息，然后审查代码，输出验证报告到 .specs/active/${changeName}/verification-report.md`;
    default:
      return `执行 ${stage} 阶段任务`;
  }
}

const TAB_AFTER_SUCCESS: Partial<Record<WorkflowStage, string>> = {
  planning: 'dev-plan',
  verifying: 'verification',
};

interface UseAgentRunnerOptions {
  projectPath: string | undefined;
  changeName: string | null;
  requirements: string;
  onFilesChanged: (changeName: string) => Promise<void>;
  onChangesChanged: () => Promise<void>;
  setActiveTab: (tab: string) => void;
}

export function useAgentRunner(options: UseAgentRunnerOptions) {
  const { projectPath, changeName, requirements, onFilesChanged, onChangesChanged, setActiveTab } = options;

  const { setStage, setRunning, setStageResult } = useWorkflowStore();
  const { appendEvent, appendLine, clear: clearOutput } = useOutputStore();
  const [runHandle, setRunHandle] = useState<AgentRunHandle | null>(null);
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);

  const checkClaude = useCallback(async () => {
    const result = await checkClaudeAvailable();
    setClaudeAvailable(result.ok);
  }, []);

  const run = useCallback(
    async (stage: WorkflowStage) => {
      if (!projectPath || !changeName) return;
      if (claudeAvailable === false) {
        toast.error('Claude CLI 未安装，请先执行: npm install -g @anthropic-ai/claude-code');
        return;
      }

      const agentName = AGENT_MAP[stage];
      if (!agentName) return;

      const prompt = buildPrompt(stage, changeName, requirements);

      setStage(stage);
      setRunning(true);
      clearOutput();
      appendLine('system', `▶ 启动 ${agentName} Agent...`);

      try {
        const handle = await runAgent({
          agentName,
          prompt,
          cwd: projectPath,
          changeName,
          onEvent: (event) => appendEvent(event),
          onStatus: (text) => appendLine('system', text),
          onError: (text) => appendLine('error', text),
          onDone: async (code) => {
            setRunning(false);
            const success = code === 0;
            setStageResult(stage, {
              stage,
              status: success ? 'success' : 'failure',
              summary: success ? '完成' : `退出码 ${code}`,
            });
            appendLine('system', success ? '✓ 完成' : `✗ 失败 (exit ${code})`);
            setRunHandle(null);
            await onFilesChanged(changeName);
            await onChangesChanged();
            const nextTab = TAB_AFTER_SUCCESS[stage];
            if (success && nextTab) setActiveTab(nextTab);
          },
        });
        setRunHandle(handle);
      } catch (e) {
        setRunning(false);
        appendLine('error', `启动失败: ${e}`);
        setRunHandle(null);
      }
    },
    [
      projectPath, changeName, claudeAvailable, requirements,
      setStage, setRunning, setStageResult, clearOutput,
      appendEvent, appendLine, onFilesChanged, onChangesChanged, setActiveTab,
    ]
  );

  const abort = useCallback(() => {
    runHandle?.abort();
    setRunning(false);
    appendLine('system', '⚠ 已中止');
    setRunHandle(null);
  }, [runHandle, setRunning, appendLine]);

  const runWithReadinessCheck = useCallback(
    (requirementsText: string, devPlanText: string) => {
      const issues: string[] = [];
      if (!requirementsText.trim()) issues.push('需求文档为空');
      if (!devPlanText.trim()) issues.push('开发规划未生成，请先运行规划');
      if (issues.length > 0) {
        issues.forEach((issue) => toast.warning(issue));
        return;
      }
      run('implementing');
    },
    [run]
  );

  return { claudeAvailable, checkClaude, run, abort, runWithReadinessCheck };
}
