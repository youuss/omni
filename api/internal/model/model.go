package model

import "time"

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Agent struct {
	ID            string   `json:"id"`
	ProjectID     string   `json:"project_id"`
	Name          string   `json:"name"`
	Description   *string  `json:"description,omitempty"`
	SystemPrompt  *string  `json:"system_prompt,omitempty"`
	Tags          []string `json:"tags"`
	IsBuiltin     bool     `json:"is_builtin"`
	DefaultConfig any      `json:"default_config"`
}

type Harness struct {
	ID          string   `json:"id"`
	ProjectID   string   `json:"project_id"`
	Name        string   `json:"name"`
	Description *string  `json:"description,omitempty"`
	Definition  any      `json:"definition"`
	IsTemplate  bool     `json:"is_template"`
	Tags        []string `json:"tags"`
}

type Run struct {
	ID          string     `json:"id"`
	HarnessID   string     `json:"harness_id"`
	Status      string     `json:"status"`
	TriggerType string     `json:"trigger_type"`
	Input       any        `json:"input"`
	Metrics     any        `json:"metrics"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedBy   *string    `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
