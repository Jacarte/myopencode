package handler

import (
	"net/http"
	"strconv"
)

// JobsResponse contains pipeline and job information.
type JobsResponse struct {
	Pipelines any `json:"pipelines"`
	Jobs      any `json:"jobs,omitempty"`
}

// GetJobs handles GET /projects/{projectID}/merge_requests/{mrIID}/jobs
func (h *Handler) GetJobs(w http.ResponseWriter, r *http.Request) {
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

	h.logger.Info("getting jobs for merge request", "project_id", projectID, "mr_iid", mrIID)

	pipelines, err := h.client.GetMergeRequestPipelines(projectID, mrIID)
	if err != nil {
		h.logger.Error("failed to get pipelines", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	response := JobsResponse{Pipelines: pipelines}

	// If there's at least one pipeline, get jobs for the most recent one
	if len(pipelines) > 0 {
		// Most recent pipeline is typically the first one
		latestPipelineID := pipelines[0].ID
		jobs, err := h.client.GetPipelineJobs(projectID, latestPipelineID)
		if err != nil {
			h.logger.Error("failed to get pipeline jobs", "error", err, "pipeline_id", latestPipelineID)
			// Don't fail the whole request, just log and continue
		} else {
			response.Jobs = jobs
		}
	}

	h.respondJSON(w, http.StatusOK, response)
}

// GetPipelineJobs handles GET /projects/{projectID}/pipelines/{pipelineID}/jobs
func (h *Handler) GetPipelineJobs(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectID")
	if projectID == "" {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "projectID"})
		return
	}

	pipelineIDStr := r.PathValue("pipelineID")
	pipelineID, err := strconv.Atoi(pipelineIDStr)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, &InvalidParamError{Param: "pipelineID"})
		return
	}

	h.logger.Info("getting jobs for pipeline", "project_id", projectID, "pipeline_id", pipelineID)

	jobs, err := h.client.GetPipelineJobs(projectID, pipelineID)
	if err != nil {
		h.logger.Error("failed to get pipeline jobs", "error", err)
		h.respondError(w, http.StatusInternalServerError, err)
		return
	}

	h.respondJSON(w, http.StatusOK, jobs)
}
