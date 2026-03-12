package handler

import (
	"net/http"
	"strconv"
)

// DiffsResponse contains both the diff metadata and actual changes.
type DiffsResponse struct {
	Diffs   any `json:"diffs"`
	Changes any `json:"changes,omitempty"`
}

// GetDiffs handles GET /projects/{projectID}/merge_requests/{mrIID}/diffs
func (h *Handler) GetDiffs(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "projectID"})
		return
	}

	mrIIDStr := r.PathValue("mrIID")
	mrIID, err := strconv.Atoi(mrIIDStr)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "mrIID"})
		return
	}

	h.logger.Info("getting diffs for merge request", "project_id", projectID, "mr_iid", mrIID)

	// Check if user wants full changes (with file content)
	includeChanges := r.URL.Query().Get("include_changes") == "true"

	diffs, err := h.client.GetMergeRequestDiffs(projectID, mrIID)
	if err != nil {
		h.logger.Error("failed to get diffs", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	response := DiffsResponse{Diffs: diffs}

	if includeChanges {
		changes, err := h.client.GetMergeRequestChanges(projectID, mrIID)
		if err != nil {
			h.logger.Error("failed to get changes", "error", err)
			// Don't fail the whole request, just log and continue
		} else {
			response.Changes = changes.Changes
		}
	}

	h.respondJSON(w, http.StatusOK, response)
}
