import axios, { AxiosInstance } from 'axios';
import { ADO_ORGANIZATION, ADO_PROJECT, ADO_PAT } from '../config';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface ADOWorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Title': string;
    'System.WorkItemType': string;
    'System.State': string;
    'System.AreaPath': string;
    'System.TeamProject': string;
    'System.Description': string;
    'Microsoft.VSTS.Common.AcceptanceCriteria': string;
    'System.Tags': string;
    'System.Parent': number;
    'System.AssignedTo'?: { displayName: string };
    [key: string]: unknown;
  };
  _links?: {
    html?: { href: string };
  };
}

export interface ADOWorkItemComment {
  text: string;
  createdBy: { displayName: string };
  createdDate: string;
}

export interface ADOQueryResult {
  workItems: Array<{ id: number; url: string }>;
}

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────
export class ADOClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = `https://dev.azure.com/${ADO_ORGANIZATION}/${ADO_PROJECT}/_apis`;
    const token = Buffer.from(`:${ADO_PAT}`).toString('base64');

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
      params: {
        'api-version': '7.1',
      },
    });
  }

  /**
   * Fetch a single Work Item by ID with all fields.
   */
  async getWorkItem(id: number): Promise<ADOWorkItem> {
    const response = await this.http.get<ADOWorkItem>(`/wit/workitems/${id}`, {
      params: {
        '$expand': 'all',
        'api-version': '7.1',
      },
    });
    return response.data;
  }

  /**
   * Fetch multiple work items by IDs (up to 200 per batch).
   */
  async getWorkItemsBatch(ids: number[]): Promise<ADOWorkItem[]> {
    if (ids.length === 0) return [];

    // ADO batch API supports max 200 items
    const chunks = chunkArray(ids, 200);
    const results: ADOWorkItem[] = [];

    for (const chunk of chunks) {
      const response = await this.http.post<{ value: ADOWorkItem[] }>(
        '/wit/workitemsbatch',
        {
          ids: chunk,
          $expand: 'all',
          fields: [
            'System.Id',
            'System.Title',
            'System.WorkItemType',
            'System.State',
            'System.AreaPath',
            'System.Description',
            'Microsoft.VSTS.Common.AcceptanceCriteria',
            'System.Tags',
            'System.Parent',
            'System.TeamProject',
          ],
        },
        { params: { 'api-version': '7.1' } }
      );
      results.push(...response.data.value);
    }

    return results;
  }

  /**
   * Run a WIQL query and return matching work item IDs.
   */
  async queryWorkItems(wiql: string): Promise<number[]> {
    const response = await this.http.post<ADOQueryResult>(
      '/wit/wiql',
      { query: wiql },
      { params: { 'api-version': '7.1' } }
    );
    return response.data.workItems.map((wi) => wi.id);
  }

  /**
   * Fetch all User Stories from a given Area Path.
   */
  async getUserStories(areaPath?: string): Promise<ADOWorkItem[]> {
    const areaFilter = areaPath
      ? `AND [System.AreaPath] UNDER '${areaPath}'`
      : '';

    const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.TeamProject] = '${ADO_PROJECT}'
        AND [System.WorkItemType] = 'User Story'
        AND [System.State] <> 'Removed'
        ${areaFilter}
      ORDER BY [System.ChangedDate] DESC
    `;

    const ids = await this.queryWorkItems(wiql);
    return this.getWorkItemsBatch(ids);
  }

  /**
   * Fetch all Epics from the project.
   */
  async getEpics(): Promise<ADOWorkItem[]> {
    const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.TeamProject] = '${ADO_PROJECT}'
        AND [System.WorkItemType] = 'Epic'
        AND [System.State] <> 'Removed'
      ORDER BY [System.ChangedDate] DESC
    `;

    const ids = await this.queryWorkItems(wiql);
    return this.getWorkItemsBatch(ids);
  }

  /**
   * Fetch all comments/discussion for a work item.
   */
  async getWorkItemComments(id: number): Promise<ADOWorkItemComment[]> {
    try {
      const response = await this.http.get<{ comments: ADOWorkItemComment[] }>(
        `/wit/workitems/${id}/comments`,
        { params: { 'api-version': '7.1-preview.3' } }
      );
      return response.data.comments || [];
    } catch {
      // Comments API may not be available on all ADO versions
      return [];
    }
  }

  /**
   * Fetch child work items of a given parent ID.
   */
  async getChildren(parentId: number): Promise<ADOWorkItem[]> {
    const wiql = `
      SELECT [System.Id]
      FROM WorkItemLinks
      WHERE [Source].[System.Id] = ${parentId}
        AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
        AND [Target].[System.WorkItemType] IN ('User Story', 'Task', 'Bug')
      MODE (Recursive)
    `;

    const ids = await this.queryWorkItems(wiql);
    return this.getWorkItemsBatch(ids);
  }
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
