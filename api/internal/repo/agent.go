package repo

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/lib/pq"
	"github.com/user/omni-fabric-api/internal/model"
)

type AgentRepo struct {
	db *sql.DB
}

func NewAgentRepo(db *sql.DB) *AgentRepo {
	return &AgentRepo{db: db}
}

func (r *AgentRepo) Create(a *model.Agent) error {
	configJSON, err := json.Marshal(a.DefaultConfig)
	if err != nil {
		return fmt.Errorf("marshal default_config: %w", err)
	}

	err = r.db.QueryRow(
		`INSERT INTO agents (project_id, name, description, system_prompt, tags, is_builtin, default_config)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		a.ProjectID, a.Name, a.Description, a.SystemPrompt,
		pq.Array(a.Tags), a.IsBuiltin, configJSON,
	).Scan(&a.ID)
	if err != nil {
		return fmt.Errorf("insert agent: %w", err)
	}
	return nil
}

func (r *AgentRepo) ListByProject(projectID string) ([]model.Agent, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, name, description, system_prompt, tags, is_builtin, default_config
		 FROM agents WHERE project_id = $1 ORDER BY name`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var agents []model.Agent
	for rows.Next() {
		var a model.Agent
		var configRaw []byte
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Name, &a.Description,
			&a.SystemPrompt, pq.Array(&a.Tags), &a.IsBuiltin, &configRaw); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		if configRaw != nil {
			if err := json.Unmarshal(configRaw, &a.DefaultConfig); err != nil {
				return nil, fmt.Errorf("unmarshal default_config: %w", err)
			}
		}
		agents = append(agents, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate agents: %w", err)
	}
	return agents, nil
}

func (r *AgentRepo) GetByID(id string) (*model.Agent, error) {
	var a model.Agent
	var configRaw []byte
	err := r.db.QueryRow(
		`SELECT id, project_id, name, description, system_prompt, tags, is_builtin, default_config
		 FROM agents WHERE id = $1`, id,
	).Scan(&a.ID, &a.ProjectID, &a.Name, &a.Description,
		&a.SystemPrompt, pq.Array(&a.Tags), &a.IsBuiltin, &configRaw)
	if err != nil {
		return nil, fmt.Errorf("get agent by id: %w", err)
	}
	if configRaw != nil {
		if err := json.Unmarshal(configRaw, &a.DefaultConfig); err != nil {
			return nil, fmt.Errorf("unmarshal default_config: %w", err)
		}
	}
	return &a, nil
}

func (r *AgentRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM agents WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete agent: %w", err)
	}
	return nil
}
