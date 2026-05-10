package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/user/omni-fabric-api/internal/repo"
)

type RunHandler struct {
	runs  *repo.RunRepo
	wsHub *WSHub
}

func NewRunHandler(runs *repo.RunRepo, wsHub *WSHub) *RunHandler {
	return &RunHandler{runs: runs, wsHub: wsHub}
}

type createRunRequest struct {
	Input       any    `json:"input,omitempty"`
	TriggerType string `json:"trigger_type,omitempty"`
}

// Create creates a new run for a harness.
func (h *RunHandler) Create(w http.ResponseWriter, r *http.Request) {
	harnessID := chi.URLParam(r, "harnessId")
	if harnessID == "" {
		writeError(w, http.StatusBadRequest, "harness id is required")
		return
	}

	var req createRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.TriggerType == "" {
		req.TriggerType = "manual"
	}

	run, err := h.runs.Create(harnessID, req.TriggerType, req.Input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create run")
		return
	}

	// Notify connected daemons to execute this run
	h.wsHub.Broadcast("daemon", map[string]string{
		"type":      "execute_run",
		"runId":     run.ID,
		"harnessId": harnessID,
	})

	writeJSON(w, http.StatusCreated, run)
}

// Get retrieves a run by ID.
func (h *RunHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	if id == "" {
		writeError(w, http.StatusBadRequest, "run id is required")
		return
	}

	run, err := h.runs.GetByID(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "run not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get run")
		return
	}

	writeJSON(w, http.StatusOK, run)
}

// GetLogs retrieves execution logs for a run.
func (h *RunHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	if runID == "" {
		writeError(w, http.StatusBadRequest, "run id is required")
		return
	}

	logs, err := h.runs.GetLogs(runID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get logs")
		return
	}

	if logs == nil {
		logs = make([]repo.ExecutionLog, 0)
	}

	writeJSON(w, http.StatusOK, logs)
}

// Abort aborts a running execution.
func (h *RunHandler) Abort(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	if runID == "" {
		writeError(w, http.StatusBadRequest, "run id is required")
		return
	}

	if err := h.runs.UpdateStatus(runID, "aborted"); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to abort run")
		return
	}

	h.wsHub.Broadcast(runID, map[string]string{
		"type":   "status",
		"status": "aborted",
	})

	w.WriteHeader(http.StatusNoContent)
}

// GateApprove broadcasts a gate approval event.
func (h *RunHandler) GateApprove(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	nodeID := chi.URLParam(r, "nodeId")
	if runID == "" || nodeID == "" {
		writeError(w, http.StatusBadRequest, "run id and node id are required")
		return
	}

	h.wsHub.Broadcast(runID, map[string]string{
		"type":   "gate",
		"nodeId": nodeID,
		"action": "approve",
	})

	w.WriteHeader(http.StatusNoContent)
}

// GateReject broadcasts a gate rejection event.
func (h *RunHandler) GateReject(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	nodeID := chi.URLParam(r, "nodeId")
	if runID == "" || nodeID == "" {
		writeError(w, http.StatusBadRequest, "run id and node id are required")
		return
	}

	h.wsHub.Broadcast(runID, map[string]string{
		"type":   "gate",
		"nodeId": nodeID,
		"action": "reject",
	})

	w.WriteHeader(http.StatusNoContent)
}
