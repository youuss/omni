import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { checkClaudeAvailable } from '../../services/claude/claude-runner';
import { HarnessExecutor } from '../../services/harness-executor';
import { useHarnessStore } from '../../stores/harnessStore';
import { useOutputStore } from '../../stores/outputStore';
import type { AgentDefinition } from '../../types/harness';

interface UseHarnessRunnerOptions {
  projectPath: string | undefined;
  runId: string | null;
  onFilesChanged: (runId: string) => Promise<void>;
  onRunsChanged: () => Promise<void>;
}

export function useHarnessRunner(options: UseHarnessRunnerOptions) {
  const { projectPath, runId, onFilesChanged, onRunsChanged } = options;

  const {
    currentHarness,
    agents,
    setNodeStatus,
    setNodeOutputs,
    setHarnessRunning,
    harnessRunning,
  } = useHarnessStore();

  const { appendEvent, appendLine, clear: clearOutput } = useOutputStore();
  const [executor, setExecutor] = useState<HarnessExecutor | null>(null);
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);

  const checkClaude = useCallback(async () => {
    const result = await checkClaudeAvailable();
    setClaudeAvailable(result.ok);
  }, []);

  const runHarness = useCallback(async () => {
    if (!projectPath || !runId || !currentHarness) return;
    if (claudeAvailable === false) {
      toast.error('Claude CLI not installed. Run: npm install -g @anthropic-ai/claude-code');
      return;
    }
    if (currentHarness.nodes.length === 0) {
      toast.warning('Harness has no nodes');
      return;
    }

    const agentMap = new Map<string, AgentDefinition>();
    for (const a of agents) {
      agentMap.set(a.id, a);
    }

    const missingAgents = currentHarness.nodes
      .filter((n) => !agentMap.has(n.agentId))
      .map((n) => n.agentId);

    if (missingAgents.length > 0) {
      toast.error(`Agents not found: ${missingAgents.join(', ')}`);
      return;
    }

    setHarnessRunning(true);
    clearOutput();
    appendLine('system', `> Executing harness "${currentHarness.name}" (${currentHarness.nodes.length} nodes)`);

    const exec = new HarnessExecutor(
      currentHarness,
      agentMap,
      { projectPath, runId },
      {
        onNodeStatusChange: (nodeId, status, error) => {
          setNodeStatus(nodeId, status, error);
          const node = currentHarness.nodes.find((n) => n.id === nodeId);
          const agentName = node ? agentMap.get(node.agentId)?.name ?? node.agentId : nodeId;

          if (status === 'running') {
            appendLine('system', `> Running ${agentName}`);
          } else if (status === 'success') {
            appendLine('system', `+ ${agentName} completed`);
          } else if (status === 'failure') {
            appendLine('error', `x ${agentName} failed${error ? `: ${error}` : ''}`);
          } else if (status === 'skipped') {
            appendLine('system', `- ${agentName} skipped`);
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
        onHarnessDone: async (success) => {
          setHarnessRunning(false);
          setExecutor(null);
          appendLine(
            'system',
            success
              ? `+ Harness "${currentHarness.name}" completed successfully`
              : `x Harness "${currentHarness.name}" finished with failures`
          );
          if (runId) {
            await onFilesChanged(runId);
            await onRunsChanged();
          }
        },
      }
    );

    setExecutor(exec);

    try {
      await exec.execute();
    } catch (e) {
      setHarnessRunning(false);
      setExecutor(null);
      appendLine('error', `Harness execution error: ${e}`);
    }
  }, [
    projectPath, runId, currentHarness, agents, claudeAvailable,
    setHarnessRunning, clearOutput, appendLine, appendEvent,
    setNodeStatus, setNodeOutputs, onFilesChanged, onRunsChanged,
  ]);

  const abort = useCallback(() => {
    executor?.abort();
    setHarnessRunning(false);
    appendLine('system', '! Harness aborted');
    setExecutor(null);
  }, [executor, setHarnessRunning, appendLine]);

  return {
    claudeAvailable,
    checkClaude,
    runHarness,
    abort,
    harnessRunning,
  };
}
