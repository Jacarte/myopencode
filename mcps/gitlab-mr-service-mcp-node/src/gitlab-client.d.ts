/**
 * GitLabClient - Native Node.js HTTP client for GitLab REST API v4
 * 
 * Direct port from Go implementation. No external HTTP libraries, uses native fetch.
 * Handles all GitLab MR operations with proper error handling and response parsing.
 * 
 * @example
 * ```typescript
 * const client = new GitLabClient('glpat-...', 'https://gitlab.com');
 * const mr = await client.getMergeRequest('123', 456);
 * console.log(mr.title);
 * ```
 */
export class GitLabClient {
  /**
   * GitLab private token (from GITLAB_TOKEN environment variable)
   */
  readonly token: string;

  /**
   * GitLab base URL (defaults to https://gitlab.com)
   * Normalized to include /api/v4 suffix
   */
  readonly baseURL: string;

  /**
   * Creates a new GitLab API client
   * 
   * @param token - GitLab private token (GITLAB_TOKEN environment variable)
   * @param baseURL - GitLab instance base URL (optional, defaults to https://gitlab.com)
   * 
   * @throws {Error} If token is not provided
   * 
   * @example
   * ```typescript
   * const client = new GitLabClient('glpat-xxxx', 'https://gitlab.example.com');
   * ```
   */
  constructor(token: string, baseURL?: string);

  /**
   * List merge requests for a project
   * 
   * @param projectID - Project ID or path
   * @param opts - Query options (all optional)
   *   - state: 'opened' | 'closed' | 'merged' | 'all' (default: 'opened')
   *   - order_by: 'created_at' | 'updated_at' (default: 'created_at')
   *   - sort: 'asc' | 'desc' (default: 'desc')
   *   - source_branch: Filter by source branch
   *   - target_branch: Filter by target branch
   *   - per_page: Number of results per page (1-100, default: 20)
   *   - page: Page number for pagination (default: 1)
   * 
   * @returns List of merge requests matching criteria
   * 
   * @example
   * ```typescript
   * const mrs = await client.listMergeRequests('123', {
   *   state: 'opened',
   *   per_page: 50,
   *   sort: 'desc'
   * });
   * ```
   */
  listMergeRequests(
    projectID: string,
    opts?: {
      state?: 'opened' | 'closed' | 'merged' | 'all';
      order_by?: 'created_at' | 'updated_at';
      sort?: 'asc' | 'desc';
      source_branch?: string;
      target_branch?: string;
      per_page?: number;
      page?: number;
    }
  ): Promise<any[]>;

  /**
   * Get a specific merge request
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID (internal ID within the project)
   * 
   * @returns Complete merge request object
   * 
   * @example
   * ```typescript
   * const mr = await client.getMergeRequest('123', 45);
   * console.log(mr.title, mr.state);
   * ```
   */
  getMergeRequest(projectID: string, mrIID: number): Promise<any>;

  /**
   * Create a new merge request
   * 
   * @param projectID - Project ID or path
   * @param opts - MR creation options
   *   - source_branch: Source branch name (required)
   *   - target_branch: Target branch name (required)
   *   - title: MR title (required)
   *   - description: MR description (optional)
   *   - assignee_id: User ID to assign (optional)
   *   - target_project_id: For forked projects (optional)
   *   - remove_source_branch: Auto-delete source branch (optional, default: false)
   *   - squash: Squash commits (optional, default: false)
   * 
   * @returns Newly created merge request object
   * 
   * @throws {Error} If required fields (source_branch, target_branch, title) are missing
   * 
   * @example
   * ```typescript
   * const mr = await client.createMergeRequest('123', {
   *   source_branch: 'feature/auth',
   *   target_branch: 'main',
   *   title: 'Add authentication support',
   *   description: 'Implements JWT token flow',
   *   remove_source_branch: true
   * });
   * ```
   */
  createMergeRequest(
    projectID: string,
    opts: {
      source_branch: string;
      target_branch: string;
      title: string;
      description?: string;
      assignee_id?: number;
      target_project_id?: number;
      remove_source_branch?: boolean;
      squash?: boolean;
    }
  ): Promise<any>;

  /**
   * Update a merge request description
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * @param description - New description text
   * 
   * @returns Updated merge request object
   * 
   * @example
   * ```typescript
   * const mr = await client.updateMergeRequestDescription('123', 45, 'Updated description');
   * ```
   */
  updateMergeRequestDescription(
    projectID: string,
    mrIID: number,
    description: string
  ): Promise<any>;

  /**
   * Add a comment/note to a merge request
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * @param body - Comment text (supports Markdown)
   * 
   * @returns Created note/comment object
   * 
   * @example
   * ```typescript
   * const note = await client.addMergeRequestNote('123', 45, 'Great work! Ready to merge.');
   * ```
   */
  addMergeRequestNote(projectID: string, mrIID: number, body: string): Promise<any>;

  /**
   * Get merge request diff (changes)
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * 
   * @returns List of diff entries with file changes
   * 
   * @example
   * ```typescript
   * const diffs = await client.getMergeRequestDiffs('123', 45);
   * diffs.forEach(d => console.log(d.new_path, d.additions));
   * ```
   */
  getMergeRequestDiffs(projectID: string, mrIID: number): Promise<any[]>;

  /**
   * Get merge request changes (detailed file modifications)
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * 
   * @returns List of changes with full diff content
   * 
   * @example
   * ```typescript
   * const changes = await client.getMergeRequestChanges('123', 45);
   * ```
   */
  getMergeRequestChanges(projectID: string, mrIID: number): Promise<any[]>;

  /**
   * Get CI/CD pipelines for a merge request
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * 
   * @returns List of pipeline objects
   * 
   * @example
   * ```typescript
   * const pipelines = await client.getMergeRequestPipelines('123', 45);
   * ```
   */
  getMergeRequestPipelines(projectID: string, mrIID: number): Promise<any[]>;

  /**
   * Get CI/CD jobs for a specific pipeline
   * 
   * @param projectID - Project ID or path
   * @param pipelineID - Pipeline ID (not IID)
   * 
   * @returns List of job objects with statuses
   * 
   * @example
   * ```typescript
   * const jobs = await client.getPipelineJobs('123', 98765);
   * jobs.forEach(j => console.log(j.name, j.status));
   * ```
   */
  getPipelineJobs(projectID: string, pipelineID: number): Promise<any[]>;

  /**
   * Get participants (users) in a merge request
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * 
   * @returns List of participant user objects
   * 
   * @example
   * ```typescript
   * const participants = await client.getMergeRequestParticipants('123', 45);
   * ```
   */
  getMergeRequestParticipants(projectID: string, mrIID: number): Promise<any[]>;

  /**
   * Get discussions (comment threads) on a merge request
   * 
   * @param projectID - Project ID or path
   * @param mrIID - Merge request IID
   * 
   * @returns List of discussion threads with notes
   * 
   * @example
   * ```typescript
   * const discussions = await client.getMergeRequestDiscussions('123', 45);
   * ```
   */
  getMergeRequestDiscussions(projectID: string, mrIID: number): Promise<any[]>;

  /**
   * Internal: Make GET request to GitLab API
   * @private
   */
  private _get(path: string, query?: Record<string, any>): Promise<any>;

  /**
   * Internal: Make POST request to GitLab API
   * @private
   */
  private _post(path: string, body?: any): Promise<any>;

  /**
   * Internal: Make PUT request to GitLab API
   * @private
   */
  private _put(path: string, body?: any): Promise<any>;

  /**
   * Internal: Handle HTTP response and parse JSON
   * @private
   */
  private _handleResponse(response: Response): Promise<any>;
}

/**
 * GitLabHandlers - MCP tool argument validation and delegation
 * 
 * Validates arguments from MCP tool calls and delegates to GitLabClient methods.
 * Ensures all required fields are present and properly typed before calling API.
 * 
 * @example
 * ```typescript
 * const handlers = new GitLabHandlers(client);
 * const result = await handlers.listMergeRequests({ project_id: '123', state: 'opened' });
 * ```
 */
export class GitLabHandlers {
  /**
   * Underlying GitLab API client
   */
  readonly client: GitLabClient;

  /**
   * Creates a new handlers instance
   * 
   * @param client - GitLab API client
   */
  constructor(client: GitLabClient);

  /**
   * Handle mr_list tool - List merge requests
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  listMergeRequests(args: {
    project_id: string;
    state?: string;
    order_by?: string;
    sort?: string;
    source_branch?: string;
    target_branch?: string;
    per_page?: number;
    page?: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_get tool - Get merge request
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getMergeRequest(args: {
    project_id: string;
    mr_iid: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_create tool - Create merge request
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  createMergeRequest(args: {
    project_id: string;
    source_branch: string;
    target_branch: string;
    title: string;
    description?: string;
    assignee_id?: number;
    target_project_id?: number;
    remove_source_branch?: boolean;
    squash?: boolean;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_update_description tool - Update MR description
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  updateMergeRequestDescription(args: {
    project_id: string;
    mr_iid: number;
    description: string;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_add_note tool - Add MR comment
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  addMergeRequestNote(args: {
    project_id: string;
    mr_iid: number;
    body: string;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_get_diffs tool - Get MR diff
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getMergeRequestDiffs(args: {
    project_id: string;
    mr_iid: number;
    include_changes?: boolean;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_get_jobs tool - Get MR CI jobs
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getMergeRequestJobs(args: {
    project_id: string;
    mr_iid: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle pipeline_get_jobs tool - Get pipeline jobs
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getPipelineJobs(args: {
    project_id: string;
    pipeline_id: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_get_discussions tool - Get MR discussions
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getMergeRequestDiscussions(args: {
    project_id: string;
    mr_iid: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;

  /**
   * Handle mr_get_participants tool - Get MR participants
   * 
   * @param args - Tool arguments from MCP
   * @returns Formatted result for MCP response
   */
  getMergeRequestParticipants(args: {
    project_id: string;
    mr_iid: number;
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}
