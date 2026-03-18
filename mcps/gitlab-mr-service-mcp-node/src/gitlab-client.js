/**
 * GitLabClient wraps the GitLab API v4 with convenience methods.
 * Uses native Node.js fetch for HTTP requests.
 */
export class GitLabClient {
  /**
   * Creates a new GitLab client with the given token and base URL.
   * @param {string} token - GitLab private token (GITLAB_TOKEN)
   * @param {string} baseURL - GitLab base URL (e.g., https://gitlab.com or self-hosted instance)
   */
  constructor(token, baseURL) {
    if (!token) {
      throw new Error('GitLab token is required');
    }
    this.token = token;
    // Normalize baseURL: default to https://gitlab.com, remove trailing slash
    if (!baseURL || baseURL.trim() === '') {
      this.baseURL = 'https://gitlab.com';
    } else {
      this.baseURL = baseURL.trim().endsWith('/') 
        ? baseURL.trim().slice(0, -1) 
        : baseURL.trim();
    }
    // Ensure /api/v4 suffix
    if (!this.baseURL.endsWith('/api/v4')) {
      this.baseURL = `${this.baseURL}/api/v4`;
    }
  }

  /**
   * Makes a GET request to the GitLab API.
   * @private
   * @param {string} path - API endpoint path (e.g., /projects/1/merge_requests)
   * @param {Object} query - Query parameters object
   * @returns {Promise<any>} - Parsed JSON response
   */
  async _get(path, query = null) {
    const url = new URL(path, this.baseURL);
    
    // Add query parameters
    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === '') {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': this.token,
        'User-Agent': 'gitlab-mcp-node/1.0',
      },
    });

    return this._handleResponse(response);
  }

  /**
   * Makes a POST request to the GitLab API.
   * @private
   * @param {string} path - API endpoint path
   * @param {Object} body - Request body (will be JSON-encoded)
   * @returns {Promise<any>} - Parsed JSON response
   */
  async _post(path, body = null) {
    const headers = {
      'PRIVATE-TOKEN': this.token,
      'User-Agent': 'gitlab-mcp-node/1.0',
    };
    
    let payload;
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(new URL(path, this.baseURL).toString(), {
      method: 'POST',
      headers,
      body: payload,
    });

    return this._handleResponse(response);
  }

  /**
   * Makes a PUT request to the GitLab API.
   * @private
   * @param {string} path - API endpoint path
   * @param {Object} body - Request body (will be JSON-encoded)
   * @returns {Promise<any>} - Parsed JSON response
   */
  async _put(path, body = null) {
    const headers = {
      'PRIVATE-TOKEN': this.token,
      'User-Agent': 'gitlab-mcp-node/1.0',
    };
    
    let payload;
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(new URL(path, this.baseURL).toString(), {
      method: 'PUT',
      headers,
      body: payload,
    });

    return this._handleResponse(response);
  }

  /**
    * Handles HTTP response, throws on error, returns parsed JSON.
    * @private
    */
  async _handleResponse(response) {
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * ListMergeRequests returns merge requests for a project.
   * @param {string} projectID - Project ID or path
   * @param {Object} opts - List options
   * @param {string} opts.state - Filter by state (opened, closed, locked, merged)
   * @param {string} opts.orderBy - Order by field (created_at, updated_at)
   * @param {string} opts.sort - Sort order (asc, desc)
   * @param {string} opts.sourceBranch - Filter by source branch
   * @param {string} opts.targetBranch - Filter by target branch
   * @param {number} opts.perPage - Number of results per page
   * @param {number} opts.page - Page number
   * @returns {Promise<Array>} - Array of merge requests
   */
  async listMergeRequests(projectID, opts = {}) {
    if (!projectID) {
      throw new Error('projectID is required');
    }

    const query = {};
    if (opts.state) query.state = opts.state;
    if (opts.orderBy) query.order_by = opts.orderBy;
    if (opts.sort) query.sort = opts.sort;
    if (opts.sourceBranch) query.source_branch = opts.sourceBranch;
    if (opts.targetBranch) query.target_branch = opts.targetBranch;
    if (opts.perPage) query.per_page = opts.perPage;
    if (opts.page) query.page = opts.page;

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests`,
      query
    );
  }

  /**
   * GetMergeRequest returns a single merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID (internal ID)
   * @returns {Promise<Object>} - Merge request object
   */
  async getMergeRequest(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}`
    );
  }

  /**
   * CreateMergeRequest creates a new merge request.
   * @param {string} projectID - Project ID or path
   * @param {Object} opts - Creation options
   * @param {string} opts.sourceBranch - Source branch (required)
   * @param {string} opts.targetBranch - Target branch (required)
   * @param {string} opts.title - MR title (required)
   * @param {string} opts.description - MR description
   * @param {number} opts.assigneeId - Assignee user ID
   * @param {number} opts.targetProjectId - Target project ID (for cross-project MRs)
   * @param {boolean} opts.removeSourceBranch - Remove source branch on merge
   * @param {boolean} opts.squash - Squash commits on merge
   * @returns {Promise<Object>} - Created merge request object
   */
  async createMergeRequest(projectID, opts = {}) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!opts.sourceBranch || !opts.targetBranch || !opts.title) {
      throw new Error('sourceBranch, targetBranch, and title are required');
    }

    const body = {
      source_branch: opts.sourceBranch,
      target_branch: opts.targetBranch,
      title: opts.title,
    };

    if (opts.description) body.description = opts.description;
    if (opts.assigneeId) body.assignee_id = opts.assigneeId;
    if (opts.targetProjectId) body.target_project_id = opts.targetProjectId;
    if (typeof opts.removeSourceBranch === 'boolean') {
      body.remove_source_branch = opts.removeSourceBranch;
    }
    if (typeof opts.squash === 'boolean') {
      body.squash = opts.squash;
    }

    return this._post(
      `/projects/${encodeURIComponent(projectID)}/merge_requests`,
      body
    );
  }

  /**
   * UpdateMergeRequestDescription updates the description of a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @param {string} description - New description text
   * @returns {Promise<Object>} - Updated merge request object
   */
  async updateMergeRequestDescription(projectID, mrIID, description) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }
    if (!description) {
      throw new Error('description is required');
    }

    return this._put(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}`,
      { description }
    );
  }

  /**
    * AddMergeRequestNote adds a comment/note to a merge request.
    * @param {string} projectID - Project ID or path
    * @param {number} mrIID - Merge request IID
    * @param {string} body - Note body text
    * @returns {Promise<Object>} - Note object
    */
  async addMergeRequestNote(projectID, mrIID, body) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }
    if (!body) {
      throw new Error('body is required');
    }

    return this._post(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/notes`,
      { body }
    );
  }

  /**
   * GetMergeRequestDiffs returns the diffs for a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @returns {Promise<Array>} - Array of diff objects
   */
  async getMergeRequestDiffs(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/diffs`
    );
  }

  /**
   * GetMergeRequestChanges returns the changes (full diff content) for a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @returns {Promise<Object>} - Merge request object with changes
   */
  async getMergeRequestChanges(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/changes`
    );
  }

  /**
   * GetMergeRequestPipelines returns the pipelines for a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @returns {Promise<Array>} - Array of pipeline objects
   */
  async getMergeRequestPipelines(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/pipelines`
    );
  }

  /**
   * GetPipelineJobs returns the jobs for a pipeline.
   * @param {string} projectID - Project ID or path
   * @param {number} pipelineID - Pipeline ID
   * @returns {Promise<Array>} - Array of job objects
   */
  async getPipelineJobs(projectID, pipelineID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(pipelineID)) {
      throw new Error('pipelineID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/pipelines/${pipelineID}/jobs`
    );
  }

  /**
   * GetMergeRequestParticipants returns users involved in a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @returns {Promise<Array>} - Array of user objects
   */
  async getMergeRequestParticipants(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/participants`
    );
  }

  /**
   * GetMergeRequestDiscussions returns review comments/discussions for a merge request.
   * @param {string} projectID - Project ID or path
   * @param {number} mrIID - Merge request IID
   * @returns {Promise<Array>} - Array of discussion objects
   */
  async getMergeRequestDiscussions(projectID, mrIID) {
    if (!projectID) {
      throw new Error('projectID is required');
    }
    if (!Number.isFinite(mrIID)) {
      throw new Error('mrIID must be a valid number');
    }

    return this._get(
      `/projects/${encodeURIComponent(projectID)}/merge_requests/${mrIID}/discussions`
    );
  }
}
