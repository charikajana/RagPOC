import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ADOClient, ADOWorkItem, ADOWorkItemComment } from './adoClient';

/**
 * Converts ADO work items into LangChain Documents with rich metadata.
 * Each chunk captures a focused section of the work item for precise retrieval.
 */
export class ADOLoader {
  private readonly client: ADOClient;
  private readonly splitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.client = new ADOClient();
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 80,
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
    });
  }

  /**
   * Loads and chunks a single User Story by ID.
   */
  async loadStory(storyId: number): Promise<Document[]> {
    console.log(`📥 Loading ADO Work Item #${storyId}...`);
    const item = await this.client.getWorkItem(storyId);
    const comments = await this.client.getWorkItemComments(storyId);
    return this.workItemToDocuments(item, comments);
  }

  /**
   * Loads all User Stories (optionally filtered by area path).
   */
  async loadAllStories(areaPath?: string): Promise<Document[]> {
    console.log(`📥 Loading all User Stories${areaPath ? ` from "${areaPath}"` : ''}...`);
    const items = await this.client.getUserStories(areaPath);
    console.log(`   Found ${items.length} User Stories`);

    const docs: Document[] = [];
    for (const item of items) {
      const comments = await this.client.getWorkItemComments(item.id);
      const itemDocs = await this.workItemToDocuments(item, comments);
      docs.push(...itemDocs);
    }

    return docs;
  }

  /**
   * Loads all Epics from the project.
   */
  async loadAllEpics(): Promise<Document[]> {
    console.log(`📥 Loading all Epics...`);
    const items = await this.client.getEpics();
    console.log(`   Found ${items.length} Epics`);

    const docs: Document[] = [];
    for (const item of items) {
      const itemDocs = await this.workItemToDocuments(item, []);
      docs.push(...itemDocs);
    }

    return docs;
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  private async workItemToDocuments(
    item: ADOWorkItem,
    comments: ADOWorkItemComment[]
  ): Promise<Document[]> {
    const fields = item.fields;
    const workItemType = fields['System.WorkItemType'];
    const title = fields['System.Title'] || '';
    const description = stripHtml(fields['System.Description'] || '');
    const acceptanceCriteria = stripHtml(
      fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || ''
    );
    const tags = fields['System.Tags'] || '';
    const areaPath = fields['System.AreaPath'] || '';
    const state = fields['System.State'] || '';

    // Build a rich, structured text block for chunking
    const fullText = [
      `WORK ITEM TYPE: ${workItemType}`,
      `ID: ${item.id}`,
      `TITLE: ${title}`,
      `AREA: ${areaPath}`,
      `STATE: ${state}`,
      `TAGS: ${tags}`,
      '',
      description ? `DESCRIPTION:\n${description}` : '',
      acceptanceCriteria
        ? `ACCEPTANCE CRITERIA:\n${acceptanceCriteria}`
        : '',
      comments.length > 0
        ? `DISCUSSION:\n${comments
            .map((c) => `[${c.createdBy?.displayName}]: ${stripHtml(c.text)}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const baseMetadata = {
      source: 'azure-devops',
      workItemId: item.id,
      workItemType,
      title,
      areaPath,
      state,
      tags,
      url: item._links?.html?.href || '',
    };

    const chunks = await this.splitter.splitText(fullText);

    return chunks.map(
      (chunk, idx) =>
        new Document({
          pageContent: chunk,
          metadata: {
            ...baseMetadata,
            chunkIndex: idx,
            totalChunks: chunks.length,
          },
        })
    );
  }
}

/**
 * Strips basic HTML tags from ADO rich-text fields.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
