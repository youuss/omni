package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/user/omni-fabric-api/internal/model"
	"github.com/user/omni-fabric-api/internal/repo"
)

type AgentHandler struct {
	agents *repo.AgentRepo
}

func NewAgentHandler(agents *repo.AgentRepo) *AgentHandler {
	return &AgentHandler{agents: agents}
}

type createAgentRequest struct {
	Name          string  `json:"name"`
	Description   *string `json:"description,omitempty"`
	SystemPrompt  *string `json:"system_prompt,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	IsBuiltin     bool    `json:"is_builtin,omitempty"`
	DefaultConfig any     `json:"default_config,omitempty"`
}

func (h *AgentHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req createAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	a := &model.Agent{
		ProjectID:     projectID,
		Name:          req.Name,
		Description:   req.Description,
		SystemPrompt:  req.SystemPrompt,
		Tags:          req.Tags,
		IsBuiltin:     req.IsBuiltin,
		DefaultConfig: req.DefaultConfig,
	}

	if err := h.agents.Create(a); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create agent")
		return
	}

	writeJSON(w, http.StatusCreated, a)
}

func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project id is required")
		return
	}

	agents, err := h.agents.ListByProject(projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agents")
		return
	}

	if agents == nil {
		agents = make([]model.Agent, 0)
	}

	writeJSON(w, http.StatusOK, agents)
}

func (h *AgentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "agent id is required")
		return
	}

	agent, err := h.agents.GetByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "agent not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get agent")
		return
	}

	writeJSON(w, http.StatusOK, agent)
}

func (h *AgentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "agent id is required")
		return
	}

	if err := h.agents.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete agent")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
