package repo

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/user/omni-fabric-api/internal/model"
)

// ExecutionLog represents a single log entry from a node execution.
type ExecutionLog struct {
	ID        string    `json:"id"`
	RunID     string    `json:"run_id"`
	NodeID    string    `json:"node_id"`
	Attempt   int       `json:"attempt"`
	LogType   string    `json:"log_type"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type RunRepo struct {
	db *sql.DB
}

func NewRunRepo(db *sql.DB) *RunRepo {
	return &RunRepo{db: db}
}

func (r *RunRepo) Create(harnessID, triggerType string, input any) (*model.Run, error) {
	var inputJSON []byte
	if input != nil {
		var err error
		inputJSON, err = json.Marshal(input)
		if err != nil {
			return nil, fmt.Errorf("marshal input: %w", err)
		}
	}

	run := &model.Run{
		HarnessID:   harnessID,
		Status:      "pending",
		TriggerType: triggerType,
		Input:       input,
	}

	err := r.db.QueryRow(
		`INSERT INTO runs (harness_id, status, trigger_type, input)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at`,
		run.HarnessID, run.Status, run.TriggerType, inputJSON,
	).Scan(&run.ID, &run.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert run: %w", err)
	}
	return run, nil
}

func (r *RunRepo) GetByID(id string) (*model.Run, error) {
	var run model.Run
	var inputRaw, metricsRaw []byte
	err := r.db.QueryRow(
		`SELECT id, harness_id, status, trigger_type, input, metrics,
		        started_at, completed_at, created_by, created_at
		 FROM runs WHERE id = $1`, id,
	).Scan(&run.ID, &run.HarnessID, &run.Status, &run.TriggerType,
		&inputRaw, &metricsRaw,
		&run.StartedAt, &run.CompletedAt, &run.CreatedBy, &run.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get run by id: %w", err)
	}
	if inputRaw != nil {
		if err := json.Unmarshal(inputRaw, &run.Input); err != nil {
			return nil, fmt.Errorf("unmarshal input: %w", err)
		}
	}
	if metricsRaw != nil {
		if err := json.Unmarshal(metricsRaw, &run.Metrics); err != nil {
			return nil, fmt.Errorf("unmarshal metrics: %w", err)
		}
	}
	return &run, nil
}

func (r *RunRepo) ListByHarness(harnessID string) ([]model.Run, error) {
	rows, err := r.db.Query(
		`SELECT id, harness_id, status, trigger_type, input, metrics,
		        started_at, completed_at, created_by, created_at
		 FROM runs WHERE harness_id = $1 ORDER BY created_at DESC`, harnessID)
	if err != nil {
		return nil, fmt.Errorf("list runs: %w", err)
	}
	defer rows.Close()

	var runs []model.Run
	for rows.Next() {
		var run model.Run
		var inputRaw, metricsRaw []byte
		if err := rows.Scan(&run.ID, &run.HarnessID, &run.Status, &run.TriggerType,
			&inputRaw, &metricsRaw,
			&run.StartedAt, &run.CompletedAt, &run.CreatedBy, &run.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan run: %w", err)
		}
		if inputRaw != nil {
			if err := json.Unmarshal(inputRaw, &run.Input); err != nil {
				return nil, fmt.Errorf("unmarshal input: %w", err)
			}
		}
		if metricsRaw != nil {
			if err := json.Unmarshal(metricsRaw, &run.Metrics); err != nil {
				return nil, fmt.Errorf("unmarshal metrics: %w", err)
			}
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate runs: %w", err)
	}
	return runs, nil
}

func (r *RunRepo) UpdateStatus(id, status string) error {
	var query string
	switch status {
	case "running":
		query = `UPDATE runs SET status = $2, started_at = NOW() WHERE id = $1`
	case "completed", "failed", "aborted":
		query = `UPDATE runs SET status = $2, completed_at = NOW() WHERE id = $1`
	default:
		query = `UPDATE runs SET status = $2 WHERE id = $1`
	}

	_, err := r.db.Exec(query, id, status)
	if err != nil {
		return fmt.Errorf("update run status: %w", err)
	}
	return nil
}

func (r *RunRepo) AppendLog(runID, nodeID string, attempt int, logType, content string) error {
	_, err := r.db.Exec(
		`INSERT INTO execution_logs (run_id, node_id, attempt, log_type, content)
		 VALUES ($1, $2, $3, $4, $5)`,
		runID, nodeID, attempt, logType, content,
	)
	if err != nil {
		return fmt.Errorf("append execution log: %w", err)
	}
	return nil
}

func (r *RunRepo) GetLogs(runID string) ([]ExecutionLog, error) {
	rows, err := r.db.Query(
		`SELECT id, run_id, node_id, attempt, log_type, content, created_at
		 FROM execution_logs WHERE run_id = $1 ORDER BY created_at`, runID)
	if err != nil {
		return nil, fmt.Errorf("get execution logs: %w", err)
	}
	defer rows.Close()

	var logs []ExecutionLog
	for rows.Next() {
		var l ExecutionLog
		if err := rows.Scan(&l.ID, &l.RunID, &l.NodeID, &l.Attempt,
			&l.LogType, &l.Content, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan execution log: %w", err)
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate execution logs: %w", err)
	}
	return logs, nil
}
