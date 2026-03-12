package gitlab

import (
	"fmt"

	"github.com/xanzy/go-gitlab"
)

// Client wraps the go-gitlab client with convenience methods.
type Client struct {
	gl *gitlab.Client
}

// NewClient creates a new GitLab client with the given token and base URL.
func NewClient(token, baseURL string) (*Client, error) {
	var gl *gitlab.Client
	var err error

	if baseURL != "" && baseURL != "https://gitlab.com" {
		gl, err = gitlab.NewClient(token, gitlab.WithBaseURL(baseURL))
	} else {
		gl, err = gitlab.NewClient(token)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create GitLab client: %w", err)
	}

	return &Client{gl: gl}, nil
}

// ListMergeRequests returns merge requests for a project.
func (c *Client) ListMergeRequests(projectID string, opts *gitlab.ListProjectMergeRequestsOptions) ([]*gitlab.MergeRequest, error) {
	mrs, _, err := c.gl.MergeRequests.ListProjectMergeRequests(projectID, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to list merge requests: %w", err)
	}
	return mrs, nil
}

// GetMergeRequest returns a single merge request.
func (c *Client) GetMergeRequest(projectID string, mrIID int) (*gitlab.MergeRequest, error) {
	mr, _, err := c.gl.MergeRequests.GetMergeRequest(projectID, mrIID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request: %w", err)
	}
	return mr, nil
}

// CreateMergeRequest creates a new merge request.
func (c *Client) CreateMergeRequest(projectID string, opts *gitlab.CreateMergeRequestOptions) (*gitlab.MergeRequest, error) {
	mr, _, err := c.gl.MergeRequests.CreateMergeRequest(projectID, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create merge request: %w", err)
	}
	return mr, nil
}

// AddMergeRequestNote adds a comment/note to a merge request.
func (c *Client) AddMergeRequestNote(projectID string, mrIID int, body string) (*gitlab.Note, error) {
	note, _, err := c.gl.Notes.CreateMergeRequestNote(projectID, mrIID, &gitlab.CreateMergeRequestNoteOptions{
		Body: gitlab.Ptr(body),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to add note to merge request: %w", err)
	}
	return note, nil
}

// GetMergeRequestDiffs returns the diffs for a merge request.
func (c *Client) GetMergeRequestDiffs(projectID string, mrIID int) ([]*gitlab.MergeRequestDiff, error) {
	diffs, _, err := c.gl.MergeRequests.ListMergeRequestDiffs(projectID, mrIID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request diffs: %w", err)
	}
	return diffs, nil
}

// GetMergeRequestChanges returns the changes (full diff content) for a merge request.
func (c *Client) GetMergeRequestChanges(projectID string, mrIID int) (*gitlab.MergeRequest, error) {
	mr, _, err := c.gl.MergeRequests.GetMergeRequestChanges(projectID, mrIID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request changes: %w", err)
	}
	return mr, nil
}

// GetMergeRequestPipelines returns the pipelines for a merge request.
func (c *Client) GetMergeRequestPipelines(projectID string, mrIID int) ([]*gitlab.PipelineInfo, error) {
	pipelines, _, err := c.gl.MergeRequests.ListMergeRequestPipelines(projectID, mrIID)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request pipelines: %w", err)
	}
	return pipelines, nil
}

// GetPipelineJobs returns the jobs for a pipeline.
func (c *Client) GetPipelineJobs(projectID string, pipelineID int) ([]*gitlab.Job, error) {
	jobs, _, err := c.gl.Jobs.ListPipelineJobs(projectID, pipelineID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get pipeline jobs: %w", err)
	}
	return jobs, nil
}

// GetMergeRequestParticipants returns users involved in a merge request.
func (c *Client) GetMergeRequestParticipants(projectID string, mrIID int) ([]*gitlab.BasicUser, error) {
	participants, _, err := c.gl.MergeRequests.GetMergeRequestParticipants(projectID, mrIID)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request participants: %w", err)
	}
	return participants, nil
}

// GetMergeRequestDiscussions returns review comments/discussions for a merge request.
func (c *Client) GetMergeRequestDiscussions(projectID string, mrIID int) ([]*gitlab.Discussion, error) {
	discussions, _, err := c.gl.Discussions.ListMergeRequestDiscussions(projectID, mrIID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get merge request discussions: %w", err)
	}
	return discussions, nil
}
