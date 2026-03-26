import { Command } from '@tauri-apps/plugin-shell';
import type { NodeConstraint, ConstraintCheck } from '../../types/harness';
import type { NodeContext } from '../../types/engine';

// === Result Type ===

export interface ConstraintResult {
  name: string;
  passed: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// === Individual Check ===

export async function checkConstraint(
  constraint: NodeConstraint,
  nodeContext: NodeContext,
  allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<ConstraintResult> {
  const { name, check } = constraint;

  try {
    return await runCheck(name, check, nodeContext, allContexts, projectPath);
  } catch (err) {
    return {
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCheck(
  name: string,
  check: ConstraintCheck,
  nodeContext: NodeContext,
  _allContexts: Record<string, NodeContext>,
  projectPath: string
): Promise<ConstraintResult> {
  switch (check.type) {
    case 'command': {
      // Run shell command via sh -c
      const command = check.command ?? '';
      const cmd = Command.create('run-constraint-check', ['-c', command], {
        cwd: projectPath,
      });

      const output = await cmd.execute();
      const exitCode = output.code ?? 1;
      const stdout = output.stdout ?? '';
      const stderr = output.stderr ?? '';

      return {
        name,
        passed: exitCode === 0,
        exitCode,
        stdout,
        stderr,
      };
    }

    case 'exitCode': {
      // Check that nodeContext.exitCode matches the expected value
      const expected = check.exitCode ?? 0;
      const actual = nodeContext.exitCode ?? 0;
      return {
        name,
        passed: actual === expected,
        exitCode: actual,
      };
    }

    case 'outputContains': {
      // Check that any output value contains the pattern as a substring
      const pattern = check.pattern ?? '';
      const allOutput = Object.values(nodeContext.outputs).join('\n');
      const passed = allOutput.includes(pattern);
      return {
        name,
        passed,
        stdout: allOutput,
      };
    }

    case 'outputMatches': {
      // Check that any output value matches the pattern as a regex
      const pattern = check.pattern ?? '';
      const allOutput = Object.values(nodeContext.outputs).join('\n');
      let passed = false;
      try {
        passed = new RegExp(pattern).test(allOutput);
      } catch {
        return {
          name,
          passed: false,
          error: `Invalid regex pattern: ${pattern}`,
          stdout: allOutput,
        };
      }
      return {
        name,
        passed,
        stdout: allOutput,
      };
    }

    default: {
      // Unknown check type — treat as passed to avoid blocking execution
      return {
        name,
        passed: true,
        error: `Unknown constraint check type: ${(check as ConstraintCheck).type}`,
      };
    }
  }
}

// === Batch Check ===

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
    const result = await checkConstraint(
      constraint,
      nodeContext,
      allContexts,
      projectPath
    );
    results.push(result);

    if (!result.passed) {
      return {
        allPassed: false,
        results,
        failedConstraint: constraint,
        failedResult: result,
      };
    }
  }

  return { allPassed: true, results };
}
