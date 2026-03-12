package handler

import (
	"net/http"
	"strconv"
	"strings"
)

// AddCommentRequest represents the request body for adding a comment.
type AddCommentRequest struct {
	Body string `json:"body"`
}

// AddComment handles POST /projects/{projectID}/merge_requests/{mrIID}/notes
// Supports both JSON and multipart/form-data (for rich markdown content).
// Form data uses -F body="<file" syntax to read file content directly.
func (h *Handler) AddComment(w http.ResponseWriter, r *http.Request) {
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

	var body string

	contentType := r.Header.Get("Content-Type")
	if contentType == "application/json" || contentType == "" {
		// JSON request
		var req AddCommentRequest
		if err := h.decodeJSON(r, &req); err != nil {
			h.respondError(w, http.StatusBadRequest, err)
			return
		}
		body = req.Body
	} else {
		if strings.HasPrefix(contentType, "multipart/form-data") {
			if err := r.ParseMultipartForm(10 << 20); err != nil {
				h.respondError(w, http.StatusBadRequest, err)
				return
			}
		} else {
			if err := r.ParseForm(); err != nil {
				h.respondError(w, http.StatusBadRequest, err)
				return
			}
		}
		body = formValueOrFile(r, "body")
	}

	if body == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "body is required"})
		return
	}

	h.logger.Info("adding comment to merge request", "project_id", projectID, "mr_iid", mrIID)

	note, err := h.client.AddMergeRequestNote(projectID, mrIID, body)
	if err != nil {
		h.logger.Error("failed to add comment", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusCreated, note)
}
