import { Command } from '@tauri-apps/plugin-shell';
import type { NodeConstraint } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

export interface ConstraintResult {
  name: string;
  passed: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function checkConstraint(
  constraint: NodeConstraint,
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<ConstraintResult> {
  try {
    const { check } = constraint;
    switch (check.type) {
      case 'shell':
        return await runShellCheck(constraint.name, check.command, projectPath);
      case 'file_contains':
        return await runFileContainsCheck(constraint.name, check.path, check.pattern, projectPath);
      case 'expression':
        return runExpressionCheck(constraint.name, check.expr, nodeContext, allContexts);
    }
  } catch (err) {
    return {
      name: constraint.name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runShellCheck(
  name: string,
  command: string,
  cwd: string
): Promise<ConstraintResult> {
  const cmd = Command.create('run-constraint-check', ['-c', command], { cwd });
  const output = await cmd.execute();
  return {
    name,
    passed: output.code === 0,
    exitCode: output.code ?? undefined,
    stdout: output.stdout?.trim() || undefined,
    stderr: output.stderr?.trim() || undefined,
  };
}

async function runFileContainsCheck(
  name: string,
  filePath: string,
  pattern: string,
  projectPath: string
): Promise<ConstraintResult> {
  const fullPath = filePath.startsWith('/') ? filePath : `${projectPath}/${filePath}`;
  const cmd = Command.create('run-constraint-check', ['-c', `cat "${fullPath}"`], {
    cwd: projectPath,
  });
  const output = await cmd.execute();
  const content = output.stdout || '';
  const regex = new RegExp(pattern);
  const passed = regex.test(content);
  return { name, passed, stdout: passed ? 'Pattern matched' : 'Pattern not found' };
}

function runExpressionCheck(
  name: string,
  expr: string,
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>
): ConstraintResult {
  const nodes: Record<string, { exitCode?: number; outputs: Record<string, string>; metadata?: Record<string, unknown> }> = {};
  for (const [nodeId, ctx] of Object.entries(allContexts)) {
    nodes[nodeId] = { exitCode: ctx.exitCode, outputs: ctx.outputs, metadata: ctx.metadata };
  }
  nodes['self'] = { exitCode: nodeContext.exitCode, outputs: nodeContext.outputs, metadata: nodeContext.metadata };

  const fn = new Function('nodes', 'self', `return Boolean(${expr})`);
  const result = fn(nodes, nodes['self']);
  return { name, passed: result, stdout: `Expression evaluated to: ${result}` };
}

export async function checkAllConstraints(
  constraints: NodeConstraint[],
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<{
  allPassed: boolean;
  results: ConstraintResult[];
  failedConstraint?: NodeConstraint;
  failedResult?: ConstraintResult;
}> {
  const results: ConstraintResult[] = [];
  for (const constraint of constraints) {
    const result = await checkConstraint(constraint, nodeContext, allContexts, projectPath);
    results.push(result);
    if (!result.passed) {
      return { allPassed: false, results, failedConstraint: constraint, failedResult: result };
    }
  }
  return { allPassed: true, results };
}
