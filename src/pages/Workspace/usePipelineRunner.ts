import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { checkClaudeAvailable } from '../../services/claude/claude-runner';
import { PipelineExecutor } from '../../services/pipeline-executor';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useOutputStore } from '../../stores/outputStore';
import type { AgentMeta } from '../../types/pipeline';

interface UsePipelineRunnerOptions {
  projectPath: string | undefined;
  changeName: string | null;
  onFilesChanged: (changeName: string) => Promise<void>;
  onChangesChanged: () => Promise<void>;
}

export function usePipelineRunner(options: UsePipelineRunnerOptions) {
  const { projectPath, changeName, onFilesChanged, onChangesChanged } = options;

  const {
    currentPipeline,
    agents,
    setNodeStatus,
    setNodeOutputs,
    setPipelineRunning,
    pipelineRunning,
  } = usePipelineStore();

  const { appendEvent, appendLine, clear: clearOutput } = useOutputStore();
  const [executor, setExecutor] = useState<PipelineExecutor | null>(null);
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);

  const checkClaude = useCallback(async () => {
    const result = await checkClaudeAvailable();
    setClaudeAvailable(result.ok);
  }, []);

  const runPipeline = useCallback(async () => {
    if (!projectPath || !changeName || !currentPipeline) return;
    if (claudeAvailable === false) {
      toast.error('Claude CLI 未安装，请先执行: npm install -g @anthropic-ai/claude-code');
      return;
    }
    if (currentPipeline.nodes.length === 0) {
      toast.warning('Pipeline 中没有任何节点');
      return;
    }

    const agentMap = new Map<string, AgentMeta>();
    for (const a of agents) {
      agentMap.set(a.id, a);
    }

    const missingAgents = currentPipeline.nodes
      .filter((n) => !agentMap.has(n.agentId))
      .map((n) => n.agentId);

    if (missingAgents.length > 0) {
      toast.error(`以下 Agent 未找到: ${missingAgents.join(', ')}`);
      return;
    }

    setPipelineRunning(true);
    clearOutput();
    appendLine('system', `▶ 开始执行 Pipeline「${currentPipeline.name}」(${currentPipeline.nodes.length} 个节点)`);

    const exec = new PipelineExecutor(
      currentPipeline,
      agentMap,
      { projectPath, changeName },
      {
        onNodeStatusChange: (nodeId, status, error) => {
          setNodeStatus(nodeId, status, error);
          const node = currentPipeline.nodes.find((n) => n.id === nodeId);
          const agentName = node ? agentMap.get(node.agentId)?.name ?? node.agentId : nodeId;

          if (status === 'running') {
            appendLine('system', `▶ 开始运行 ${agentName}`);
          } else if (status === 'success') {
            appendLine('system', `✓ ${agentName} 完成`);
          } else if (status === 'failure') {
            appendLine('error', `✗ ${agentName} 失败${error ? `: ${error}` : ''}`);
          } else if (status === 'skipped') {
            appendLine('system', `⏭ ${agentName} 跳过`);
          }
        },
        onNodeOutputs: (nodeId, outputs) => {
          setNodeOutputs(nodeId, outputs);
        },
        onEvent: (_nodeId, event) => {
          appendEvent(event);
        },
        onStatus: (_nodeId, text) => {
          appendLine('system', text);
        },
        onError: (_nodeId, text) => {
          appendLine('error', text);
        },
        onPipelineDone: async (success) => {
          setPipelineRunning(false);
          setExecutor(null);
          appendLine(
            'system',
            success
              ? `✓ Pipeline「${currentPipeline.name}」全部完成`
              : `✗ Pipeline「${currentPipeline.name}」执行结束（存在失败）`
          );
          if (changeName) {
            await onFilesChanged(changeName);
            await onChangesChanged();
          }
        },
      }
    );

    setExecutor(exec);

    try {
      await exec.execute();
    } catch (e) {
      setPipelineRunning(false);
      setExecutor(null);
      appendLine('error', `Pipeline 执行异常: ${e}`);
    }
  }, [
    projectPath, changeName, currentPipeline, agents, claudeAvailable,
    setPipelineRunning, clearOutput, appendLine, appendEvent,
    setNodeStatus, setNodeOutputs, onFilesChanged, onChangesChanged,
  ]);

  const abort = useCallback(() => {
    executor?.abort();
    setPipelineRunning(false);
    appendLine('system', '⚠ Pipeline 已中止');
    setExecutor(null);
  }, [executor, setPipelineRunning, appendLine]);

  return {
    claudeAvailable,
    checkClaude,
    runPipeline,
    abort,
    pipelineRunning,
  };
}
