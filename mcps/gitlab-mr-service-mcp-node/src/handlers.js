import { GitLabClient } from './gitlab-client.js';

export class GitLabHandlers {
  constructor(client) {
    if (!client || !(client instanceof GitLabClient)) {
      throw new Error('client must be a GitLabClient instance');
    }
    this.client = client;
  }

  async listMergeRequests(args) {
    const projectId = this._getString(args, 'project_id');
    if (!projectId) throw new Error('project_id is required');

    const opts = {};
    if (args.state) opts.state = this._getString(args, 'state');
    if (args.order_by) opts.orderBy = this._getString(args, 'order_by');
    if (args.sort) opts.sort = this._getString(args, 'sort');
    if (args.source_branch) opts.sourceBranch = this._getString(args, 'source_branch');
    if (args.target_branch) opts.targetBranch = this._getString(args, 'target_branch');
    if (args.per_page) opts.perPage = this._getNumber(args, 'per_page');
    if (args.page) opts.page = this._getNumber(args, 'page');

    return this.client.listMergeRequests(projectId, opts);
  }

  async getMergeRequest(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');
    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');

    return this.client.getMergeRequest(projectId, mrIid);
  }

  async createMergeRequest(args) {
    const projectId = this._getString(args, 'project_id');
    if (!projectId) throw new Error('project_id is required');

    const opts = {
      sourceBranch: this._getString(args, 'source_branch'),
      targetBranch: this._getString(args, 'target_branch'),
      title: this._getString(args, 'title'),
    };

    if (!opts.sourceBranch) throw new Error('source_branch is required');
    if (!opts.targetBranch) throw new Error('target_branch is required');
    if (!opts.title) throw new Error('title is required');

    if (args.description) opts.description = this._getString(args, 'description');
    if (args.assignee_id) opts.assigneeId = this._getNumber(args, 'assignee_id');
    if (args.target_project_id) opts.targetProjectId = this._getNumber(args, 'target_project_id');
    if (typeof args.remove_source_branch === 'boolean') {
      opts.removeSourceBranch = args.remove_source_branch;
    }
    if (typeof args.squash === 'boolean') {
      opts.squash = args.squash;
    }

    return this.client.createMergeRequest(projectId, opts);
  }

  async updateMergeRequestDescription(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');
    const description = this._getString(args, 'description');

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');
    if (!description) throw new Error('description is required');

    return this.client.updateMergeRequestDescription(projectId, mrIid, description);
  }

  async addMergeRequestNote(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');
    const body = this._getString(args, 'body');

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');
    if (!body) throw new Error('body is required');

    return this.client.addMergeRequestNote(projectId, mrIid, body);
  }

  async getMergeRequestDiffs(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');
    const includeChanges = args.include_changes === true;

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');

    if (includeChanges) {
      return this.client.getMergeRequestChanges(projectId, mrIid);
    }
    return this.client.getMergeRequestDiffs(projectId, mrIid);
  }

  async getMergeRequestJobs(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');

    const pipelines = await this.client.getMergeRequestPipelines(projectId, mrIid);
    if (!Array.isArray(pipelines) || pipelines.length === 0) {
      return [];
    }

    const mostRecentPipeline = pipelines[0];
    if (mostRecentPipeline?.id) {
      return this.client.getPipelineJobs(projectId, mostRecentPipeline.id);
    }
    return [];
  }

  async getPipelineJobs(args) {
    const projectId = this._getString(args, 'project_id');
    const pipelineId = this._getNumber(args, 'pipeline_id');

    if (!projectId) throw new Error('project_id is required');
    if (!pipelineId) throw new Error('pipeline_id is required');

    return this.client.getPipelineJobs(projectId, pipelineId);
  }

  async getMergeRequestDiscussions(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');

    return this.client.getMergeRequestDiscussions(projectId, mrIid);
  }

  async getMergeRequestParticipants(args) {
    const projectId = this._getString(args, 'project_id');
    const mrIid = this._getNumber(args, 'mr_iid');

    if (!projectId) throw new Error('project_id is required');
    if (!mrIid) throw new Error('mr_iid is required');

    return this.client.getMergeRequestParticipants(projectId, mrIid);
  }

  _getString(obj, key) {
    const value = obj[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  _getNumber(obj, key) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return 0;
  }

  async _putMergeRequest(projectId, mrIid, data) {
    const token = process.env.GITLAB_TOKEN;
    if (!token) throw new Error('GITLAB_TOKEN environment variable is required');

    const baseUrl = (process.env.GITLAB_URL || 'https://gitlab.com').trim();
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const apiBase = normalizedBase.endsWith('/api/v4')
      ? normalizedBase
      : `${normalizedBase}/api/v4`;

    const url = `${apiBase}/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
