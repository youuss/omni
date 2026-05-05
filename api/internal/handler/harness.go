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

type HarnessHandler struct {
	harnesses *repo.HarnessRepo
}

func NewHarnessHandler(harnesses *repo.HarnessRepo) *HarnessHandler {
	return &HarnessHandler{harnesses: harnesses}
}

type createHarnessRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Definition  any     `json:"definition,omitempty"`
	IsTemplate  bool    `json:"is_template,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

type updateDefinitionRequest struct {
	Definition any `json:"definition"`
}

func (h *HarnessHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req createHarnessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	harness := &model.Harness{
		ProjectID:   projectID,
		Name:        req.Name,
		Description: req.Description,
		Definition:  req.Definition,
		IsTemplate:  req.IsTemplate,
		Tags:        req.Tags,
	}

	if err := h.harnesses.Create(harness); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create harness")
		return
	}

	writeJSON(w, http.StatusCreated, harness)
}

func (h *HarnessHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project id is required")
		return
	}

	harnesses, err := h.harnesses.ListByProject(projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list harnesses")
		return
	}

	if harnesses == nil {
		harnesses = make([]model.Harness, 0)
	}

	writeJSON(w, http.StatusOK, harnesses)
}

func (h *HarnessHandler) Get(w http.ResponseWriter, r *http.Request) {
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

func (h *HarnessHandler) UpdateDefinition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "harness id is required")
		return
	}

	var req updateDefinitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.harnesses.UpdateDefinition(id, req.Definition); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update harness definition")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *HarnessHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "harness id is required")
		return
	}

	if err := h.harnesses.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete harness")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
