package handler

import (
	"net/http"
	"strconv"
)

// GetDiscussions handles GET /projects/{projectID}/merge_requests/{mrIID}/discussions
func (h *Handler) GetDiscussions(w http.ResponseWriter, r *http.Request) {
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

	h.logger.Info("getting discussions for merge request", "project_id", projectID, "mr_iid", mrIID)

	discussions, err := h.client.GetMergeRequestDiscussions(projectID, mrIID)
	if err != nil {
		h.logger.Error("failed to get discussions", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusOK, discussions)
}

// GetParticipants handles GET /projects/{projectID}/merge_requests/{mrIID}/participants
func (h *Handler) GetParticipants(w http.ResponseWriter, r *http.Request) {
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

	h.logger.Info("getting participants for merge request", "project_id", projectID, "mr_iid", mrIID)

	participants, err := h.client.GetMergeRequestParticipants(projectID, mrIID)
	if err != nil {
		h.logger.Error("failed to get participants", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusOK, participants)
}
