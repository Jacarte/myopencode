package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/xanzy/go-gitlab"
)

// ListMergeRequestsRequest represents the request body for listing MRs.
type ListMergeRequestsRequest struct {
	State        string `json:"state,omitempty"`
	OrderBy      string `json:"order_by,omitempty"`
	Sort         string `json:"sort,omitempty"`
	SourceBranch string `json:"source_branch,omitempty"`
	TargetBranch string `json:"target_branch,omitempty"`
	AuthorID     int    `json:"author_id,omitempty"`
	AssigneeID   int    `json:"assignee_id,omitempty"`
	PerPage      int    `json:"per_page,omitempty"`
	Page         int    `json:"page,omitempty"`
}

// CreateMergeRequestRequest represents the request body for creating an MR.
type CreateMergeRequestRequest struct {
	SourceBranch       string `json:"source_branch"`
	TargetBranch       string `json:"target_branch"`
	Title              string `json:"title"`
	Description        string `json:"description,omitempty"`
	AssigneeID         int    `json:"assignee_id,omitempty"`
	TargetProjectID    int    `json:"target_project_id,omitempty"`
	RemoveSourceBranch bool   `json:"remove_source_branch,omitempty"`
	Squash             bool   `json:"squash,omitempty"`
}

// ListMergeRequests handles GET /projects/{projectID}/merge_requests
func (h *Handler) ListMergeRequests(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "projectID"})
		return
	}

	opts := &gitlab.ListProjectMergeRequestsOptions{}

	// Parse query parameters
	if state := r.URL.Query().Get("state"); state != "" {
		opts.State = gitlab.Ptr(state)
	}
	if orderBy := r.URL.Query().Get("order_by"); orderBy != "" {
		opts.OrderBy = gitlab.Ptr(orderBy)
	}
	if sort := r.URL.Query().Get("sort"); sort != "" {
		opts.Sort = gitlab.Ptr(sort)
	}
	if sourceBranch := r.URL.Query().Get("source_branch"); sourceBranch != "" {
		opts.SourceBranch = gitlab.Ptr(sourceBranch)
	}
	if targetBranch := r.URL.Query().Get("target_branch"); targetBranch != "" {
		opts.TargetBranch = gitlab.Ptr(targetBranch)
	}
	if perPage := r.URL.Query().Get("per_page"); perPage != "" {
		if pp, err := strconv.Atoi(perPage); err == nil {
			opts.PerPage = pp
		}
	}
	if page := r.URL.Query().Get("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil {
			opts.Page = p
		}
	}

	h.logger.Info("listing merge requests", "project_id", projectID)

	mrs, err := h.client.ListMergeRequests(projectID, opts)
	if err != nil {
		h.logger.Error("failed to list merge requests", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusOK, mrs)
}

// GetMergeRequest handles GET /projects/{projectID}/merge_requests/{mrIID}
func (h *Handler) GetMergeRequest(w http.ResponseWriter, r *http.Request) {
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

	h.logger.Info("getting merge request", "project_id", projectID, "mr_iid", mrIID)

	mr, err := h.client.GetMergeRequest(projectID, mrIID)
	if err != nil {
		h.logger.Error("failed to get merge request", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusOK, mr)
}

// CreateMergeRequest handles POST /projects/{projectID}/merge_requests
// Supports both JSON and multipart/form-data (for rich markdown content).
// Form data uses -F field="<file" syntax to read file content directly.
func (h *Handler) CreateMergeRequest(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "projectID"})
		return
	}

	var req CreateMergeRequestRequest

	contentType := r.Header.Get("Content-Type")
	if contentType == "application/json" || contentType == "" {
		// JSON request
		if err := h.decodeJSON(r, &req); err != nil {
			h.respondError(w, http.StatusBadRequest, err)
			return
		}
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
		req.SourceBranch = formValueOrFile(r, "source_branch")
		req.TargetBranch = formValueOrFile(r, "target_branch")
		req.Title = formValueOrFile(r, "title")
		req.Description = formValueOrFile(r, "description")
		if assigneeID := r.FormValue("assignee_id"); assigneeID != "" {
			if id, err := strconv.Atoi(assigneeID); err == nil {
				req.AssigneeID = id
			}
		}
		if targetProjectID := r.FormValue("target_project_id"); targetProjectID != "" {
			if id, err := strconv.Atoi(targetProjectID); err == nil {
				req.TargetProjectID = id
			}
		}
		req.RemoveSourceBranch = r.FormValue("remove_source_branch") == "true"
		req.Squash = r.FormValue("squash") == "true"
	}

	if req.SourceBranch == "" || req.TargetBranch == "" || req.Title == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "source_branch, target_branch, and title are required"})
		return
	}

	opts := &gitlab.CreateMergeRequestOptions{
		SourceBranch:       gitlab.Ptr(req.SourceBranch),
		TargetBranch:       gitlab.Ptr(req.TargetBranch),
		Title:              gitlab.Ptr(req.Title),
		RemoveSourceBranch: gitlab.Ptr(req.RemoveSourceBranch),
		Squash:             gitlab.Ptr(req.Squash),
	}

	if req.Description != "" {
		opts.Description = gitlab.Ptr(req.Description)
	}
	if req.AssigneeID != 0 {
		opts.AssigneeID = gitlab.Ptr(req.AssigneeID)
	}
	if req.TargetProjectID != 0 {
		opts.TargetProjectID = gitlab.Ptr(req.TargetProjectID)
	}

	h.logger.Info("creating merge request", "project_id", projectID, "source_branch", req.SourceBranch, "target_branch", req.TargetBranch)

	mr, err := h.client.CreateMergeRequest(projectID, opts)
	if err != nil {
		h.logger.Error("failed to create merge request", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusCreated, mr)
}

// InvalidParamError represents an invalid parameter error.
type InvalidParamError struct {
	Param string
}

func (e *InvalidParamError) Error() string {
	return "invalid or missing parameter: " + e.Param
}
