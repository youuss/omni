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

// InternalHandler serves unauthenticated endpoints for the local daemon.
type InternalHandler struct {
	harnesses *repo.HarnessRepo
	agents    *repo.AgentRepo
	runs      *repo.RunRepo
}

// NewInternalHandler creates a new InternalHandler.
func NewInternalHandler(harnesses *repo.HarnessRepo, agents *repo.AgentRepo, runs *repo.RunRepo) *InternalHandler {
	return &InternalHandler{
		harnesses: harnesses,
		agents:    agents,
		runs:      runs,
	}
}

// GetHarness returns a harness with its full definition.
// Used by the daemon to fetch harness DAG for execution.
func (h *InternalHandler) GetHarness(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "harness id is required")
		return
	}

	harness, err := h.harnesses.GetByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "harness not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get harness")
		return
	}

	writeJSON(w, http.StatusOK, harness)
}

// GetProjectAgents returns all agents for a project.
// Used by the daemon to resolve agent definitions for a harness run.
func (h *InternalHandler) GetProjectAgents(w http.ResponseWriter, r *http.Request) {
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

type updateRunStatusRequest struct {
	Status string `json:"status"`
}

// UpdateRunStatus updates the status of a run.
// Used by the daemon to report run progress back to the API.
func (h *InternalHandler) UpdateRunStatus(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	if runID == "" {
		writeError(w, http.StatusBadRequest, "run id is required")
		return
	}

	var req updateRunStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Status == "" {
		writeError(w, http.StatusBadRequest, "status is required")
		return
	}

	if err := h.runs.UpdateStatus(runID, req.Status); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update run status")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
