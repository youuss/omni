package executor

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
)

// CheckConstraint runs a single constraint check against the node context.
func CheckConstraint(c Constraint, ctx *NodeContext, allCtx map[string]*NodeContext, projectDir string) ConstraintResult {
	switch c.Check.Type {
	case "shell":
		return runShellCheck(c.Name, c.Check.Command, projectDir)
	case "file_contains":
		return runFileContainsCheck(c.Name, c.Check.Path, c.Check.Pattern, projectDir)
	case "expression":
		return runExpressionCheck(c.Name, c.Check.Expr, ctx, allCtx)
	default:
		return ConstraintResult{
			Name:   c.Name,
			Passed: false,
			Error:  fmt.Sprintf("unknown constraint check type: %s", c.Check.Type),
		}
	}
}

// CheckAllConstraints runs all constraints in order. Returns on the first failure.
func CheckAllConstraints(constraints []Constraint, ctx *NodeContext, allCtx map[string]*NodeContext, projectDir string) CheckAllResult {
	var results []ConstraintResult
	for _, c := range constraints {
		r := CheckConstraint(c, ctx, allCtx, projectDir)
		results = append(results, r)
		if !r.Passed {
			return CheckAllResult{
				AllPassed:        false,
				Results:          results,
				FailedConstraint: &c,
				FailedResult:     &r,
			}
		}
	}
	return CheckAllResult{AllPassed: true, Results: results}
}

// --- shell check ---

func runShellCheck(name, command, cwd string) ConstraintResult {
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()
	if err != nil {
		exitCode := 1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
		return ConstraintResult{
			Name:     name,
			Passed:   false,
			ExitCode: exitCode,
			Stdout:   string(out),
			Stderr:   "",
		}
	}
	return ConstraintResult{
		Name:   name,
		Passed: true,
		Stdout: trimStr(string(out)),
	}
}

// --- file_contains check ---

func runFileContainsCheck(name, filePath, pattern, projectDir string) ConstraintResult {
	fullPath := filePath
	if !filepath.IsAbs(filePath) {
		fullPath = filepath.Join(projectDir, filePath)
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		return ConstraintResult{
			Name:   name,
			Passed: false,
			Error:  fmt.Sprintf("failed to read file %s: %v", fullPath, err),
		}
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		return ConstraintResult{
			Name:   name,
			Passed: false,
			Error:  fmt.Sprintf("invalid regex pattern %q: %v", pattern, err),
		}
	}

	passed := re.Match(data)
	msg := "Pattern not found"
	if passed {
		msg = "Pattern matched"
	}
	return ConstraintResult{
		Name:   name,
		Passed: passed,
		Stdout: msg,
	}
}

// --- expression check (placeholder) ---

func runExpressionCheck(name, expr string, ctx *NodeContext, allCtx map[string]*NodeContext) ConstraintResult {
	// Expression evaluation is not yet implemented in Go.
	// Return an error so callers know this check type is unsupported.
	return ConstraintResult{
		Name:   name,
		Passed: false,
		Error:  fmt.Sprintf("expression constraint check not yet implemented (expr: %s)", expr),
	}
}

// --- helpers ---

func trimStr(s string) string {
	if len(s) > 4096 {
		return s[:4096] + "...(truncated)"
	}
	return s
}
