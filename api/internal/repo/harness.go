package repo

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/lib/pq"
	"github.com/user/omni-fabric-api/internal/model"
)

type HarnessRepo struct {
	db *sql.DB
}

func NewHarnessRepo(db *sql.DB) *HarnessRepo {
	return &HarnessRepo{db: db}
}

func (r *HarnessRepo) Create(h *model.Harness) error {
	defJSON, err := json.Marshal(h.Definition)
	if err != nil {
		return fmt.Errorf("marshal definition: %w", err)
	}

	err = r.db.QueryRow(
		`INSERT INTO harnesses (project_id, name, description, definition, is_template, tags)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		h.ProjectID, h.Name, h.Description, defJSON,
		h.IsTemplate, pq.Array(h.Tags),
	).Scan(&h.ID)
	if err != nil {
		return fmt.Errorf("insert harness: %w", err)
	}
	return nil
}

func (r *HarnessRepo) ListByProject(projectID string) ([]model.Harness, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, name, description, definition, is_template, tags
		 FROM harnesses WHERE project_id = $1 ORDER BY name`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list harnesses: %w", err)
	}
	defer rows.Close()

	var harnesses []model.Harness
	for rows.Next() {
		var h model.Harness
		var defRaw []byte
		if err := rows.Scan(&h.ID, &h.ProjectID, &h.Name, &h.Description,
			&defRaw, &h.IsTemplate, pq.Array(&h.Tags)); err != nil {
			return nil, fmt.Errorf("scan harness: %w", err)
		}
		if defRaw != nil {
			if err := json.Unmarshal(defRaw, &h.Definition); err != nil {
				return nil, fmt.Errorf("unmarshal definition: %w", err)
			}
		}
		harnesses = append(harnesses, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate harnesses: %w", err)
	}
	return harnesses, nil
}

func (r *HarnessRepo) GetByID(id string) (*model.Harness, error) {
	var h model.Harness
	var defRaw []byte
	err := r.db.QueryRow(
		`SELECT id, project_id, name, description, definition, is_template, tags
		 FROM harnesses WHERE id = $1`, id,
	).Scan(&h.ID, &h.ProjectID, &h.Name, &h.Description,
		&defRaw, &h.IsTemplate, pq.Array(&h.Tags))
	if err != nil {
		return nil, fmt.Errorf("get harness by id: %w", err)
	}
	if defRaw != nil {
		if err := json.Unmarshal(defRaw, &h.Definition); err != nil {
			return nil, fmt.Errorf("unmarshal definition: %w", err)
		}
	}
	return &h, nil
}

func (r *HarnessRepo) UpdateDefinition(id string, definition any) error {
	defJSON, err := json.Marshal(definition)
	if err != nil {
		return fmt.Errorf("marshal definition: %w", err)
	}

	_, err = r.db.Exec(
		`UPDATE harnesses SET definition = $2, updated_at = NOW() WHERE id = $1`, id, defJSON)
	if err != nil {
		return fmt.Errorf("update harness definition: %w", err)
	}
	return nil
}

func (r *HarnessRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM harnesses WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete harness: %w", err)
	}
	return nil
}
