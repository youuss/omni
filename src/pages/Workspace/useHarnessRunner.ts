import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { checkClaudeAvailable } from '../../services/claude/claude-runner';
import { HarnessExecutor } from '../../services/harness-executor';
import { writeRunFile } from '../../services/run-service';
import { useHarnessStore } from '../../stores/harnessStore';
import { useOutputStore } from '../../stores/outputStore';
import { useRunStore } from '../../stores/runStore';

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
  const { executionMode, startFromNodeId, setRunning, setState } = useRunStore();
  const [executor, setExecutor] = useState<HarnessExecutor | null>(null);
  const [claudeAvailable, setClaudeAvailable] = useState<boolean | null>(null);

  const checkClaude = useCallback(async () => {
    const result = await checkClaudeAvailable();
    setClaudeAvailable(result.ok);
  }, []);

  const runHarness = useCallback(async (harnessInputs?: Record<string, string>) => {
    if (!projectPath || !runId || !currentHarness) return;
    if (claudeAvailable === false) {
      toast.error('Claude CLI not installed. Run: npm install -g @anthropic-ai/claude-code');
      return;
    }
    if (currentHarness.nodes.length === 0) {
      toast.warning('Harness has no nodes');
      return;
    }

    // Write input values to disk before execution
    if (harnessInputs && currentHarness.inputs) {
      for (const inputDef of currentHarness.inputs) {
        const value = harnessInputs[inputDef.name];
        if (value?.trim() && inputDef.filename) {
          await writeRunFile(projectPath, runId, `inputs/${inputDef.filename}`, value.trim());
        }
      }
    }

    setHarnessRunning(true);
    setRunning(true);
    setState('running');
    clearOutput();
    appendLine('system', `> Executing harness "${currentHarness.name}" (${currentHarness.nodes.length} nodes)`);

    const exec = new HarnessExecutor({
      projectPath,
      runId,
      harness: currentHarness,
      agents,
      callbacks: {
        onNodeStatusChange: (nodeId, status, error) => {
          setNodeStatus(nodeId, status, error);
          appendLine('system', `[${nodeId}] ${status}${error ? ': ' + error : ''}`, nodeId);
        },
        onNodeOutputs: (nodeId, outputs) => {
          setNodeOutputs(nodeId, outputs);
        },
        onEvent: (nodeId, event) => {
          appendEvent(event, nodeId);
        },
        onGateWait: async (_nodeId, _message) => {
          // TODO: connect to a UI dialog
          return true;
        },
        onStatus: (nodeId, text) => {
          appendLine('system', `[${nodeId}] ${text}`, nodeId);
        },
        onError: (nodeId, text) => {
          appendLine('error', `[${nodeId}] ${text}`, nodeId);
        },
        onHarnessDone: async (success) => {
          setHarnessRunning(false);
          setRunning(false);
          setState(success ? 'completed' : 'failed');
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
      },
      startFromNodeId: executionMode === 'fromNode' ? startFromNodeId ?? undefined : undefined,
      stepMode: executionMode === 'step',
    });

    setExecutor(exec);

    try {
      await exec.execute();
    } catch (e) {
      setHarnessRunning(false);
      setRunning(false);
      setState('failed');
      setExecutor(null);
      appendLine('error', `Harness execution error: ${e}`);
    }
  }, [
    projectPath, runId, currentHarness, agents, claudeAvailable,
    executionMode, startFromNodeId,
    setHarnessRunning, setRunning, setState, clearOutput, appendLine, appendEvent,
    setNodeStatus, setNodeOutputs, onFilesChanged, onRunsChanged,
  ]);

  const abort = useCallback(() => {
    executor?.abort();
    setHarnessRunning(false);
    setRunning(false);
    appendLine('system', '! Harness aborted');
    setExecutor(null);
  }, [executor, setHarnessRunning, setRunning, appendLine]);

  return {
    claudeAvailable,
    checkClaude,
    runHarness,
    abort,
    harnessRunning,
  };
}
