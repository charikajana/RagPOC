import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
} from '../config';
import { similaritySearch } from '../vectorStore/chromaClient';
import { ADOClient } from '../connectors/adoClient';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface GenerateTestResult {
  storyId: number;
  storyTitle: string;
  featureFile: string;
  stepDefinitions: string;
  retrievedChunks: RetrievedChunk[];
  model: string;
}

export interface RetrievedChunk {
  content: string;
  source: string;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert QA automation engineer specialising in Cucumber/Gherkin BDD and TypeScript.

Your task is to generate production-ready test cases from Azure DevOps User Stories.

## Rules
1. Write Gherkin scenarios in proper BDD style (Given/When/Then).
2. Cover the HAPPY PATH and at least 2 NEGATIVE / EDGE cases.
3. Use Scenario Outline + Examples table for data-driven tests where appropriate.
4. Reference the ACCEPTANCE CRITERIA as the source of truth for expected outcomes.
5. Match the coding style EXACTLY from the example step definitions provided in the context.
6. Generate TypeScript step definitions using the @cucumber/cucumber library with async/await.
7. Use descriptive step text that is re-usable across scenarios.
8. Add @tags above each scenario matching the ADO story ID and feature area.

## Output Format
Return EXACTLY this structure with no extra text outside the markers:

=== FEATURE FILE ===
[Full Gherkin .feature file content here]

=== STEP DEFINITIONS ===
[Full TypeScript step definitions file content here]`;

// ─────────────────────────────────────────────
// RAG CHAIN
// ─────────────────────────────────────────────
export class RAGChain {
  private readonly llm: ChatAnthropic;
  private readonly adoClient: ADOClient;

  constructor() {
    this.llm = new ChatAnthropic({
      apiKey: ANTHROPIC_API_KEY,
      model: ANTHROPIC_MODEL,
      temperature: 0.2,   // Low temp → consistent, structured Gherkin output
      maxTokens: 4096,
    });

    this.adoClient = new ADOClient();
  }

  /**
   * Main entry point: generate test cases for a given ADO User Story ID.
   */
  async generateTests(storyId: number): Promise<GenerateTestResult> {
    console.log(`\n🤖 Generating tests for Story #${storyId} using ${ANTHROPIC_MODEL}...`);

    // ── Step 1: Fetch the User Story from ADO ──────────────────────────
    const workItem = await this.adoClient.getWorkItem(storyId);
    const fields = workItem.fields;
    const title = fields['System.Title'] || '';
    const description = stripHtml(fields['System.Description'] || '');
    const acceptanceCriteria = stripHtml(
      fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || ''
    );
    const areaPath = fields['System.AreaPath'] || '';
    const tags = fields['System.Tags'] || '';

    console.log(`   📋 Title: ${title}`);
    console.log(`   📁 Area:  ${areaPath}`);

    // ── Step 2: Retrieve relevant context from vector store ───────────
    // Run 3 targeted queries to maximise relevant chunk recall
    const queries = [
      `${title} ${description.substring(0, 200)}`,
      acceptanceCriteria.substring(0, 300),
      `${areaPath} feature file step definitions`,
    ].filter(Boolean);

    const retrievedDocs: Document[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      try {
        const docs = await similaritySearch(query, 4);
        for (const doc of docs) {
          const key = doc.pageContent.substring(0, 100);
          if (!seen.has(key)) {
            seen.add(key);
            retrievedDocs.push(doc);
          }
        }
      } catch {
        // Vector store may be empty during first run — continue without context
        console.warn('   ⚠️  Vector store query failed (may be empty — run ingestion scripts first)');
        break;
      }
    }

    // Cap at top 8 most relevant chunks to stay within context window
    const contextDocs = retrievedDocs.slice(0, 8);
    console.log(`   🔍 Retrieved ${contextDocs.length} relevant context chunks`);

    // ── Step 3: Build the prompt ───────────────────────────────────────
    const contextText = contextDocs.length > 0
      ? contextDocs
          .map((doc, i) => {
            const src = doc.metadata['source'] || 'unknown';
            const file = doc.metadata['filePath'] || doc.metadata['featureName'] || '';
            return `[Context ${i + 1} — ${src} ${file}]\n${doc.pageContent}`;
          })
          .join('\n\n---\n\n')
      : 'No existing context found — use standard Cucumber/TypeScript patterns.';

    const userMessage = `
## USER STORY #${storyId}
**Title**: ${title}
**Area**: ${areaPath}
**Tags**: ${tags}

### Description
${description || 'No description provided.'}

### Acceptance Criteria
${acceptanceCriteria || 'No acceptance criteria provided.'}

## RETRIEVED CONTEXT (Match this framework style exactly)
${contextText}

## YOUR TASK
Generate a complete Gherkin .feature file AND TypeScript step definitions for this User Story.
`;

    // ── Step 4: Invoke Claude ──────────────────────────────────────────
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate('{userMessage}'),
    ]);

    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());

    console.log(`   ✨ Calling Claude (${ANTHROPIC_MODEL})...`);
    const rawOutput = await chain.invoke({ userMessage });

    // ── Step 5: Parse the structured output ───────────────────────────
    const { featureFile, stepDefinitions } = parseOutput(rawOutput);

    return {
      storyId,
      storyTitle: title,
      featureFile,
      stepDefinitions,
      model: ANTHROPIC_MODEL,
      retrievedChunks: contextDocs.map((doc) => ({
        content: doc.pageContent,
        source: String(doc.metadata['source'] || ''),
        metadata: doc.metadata as Record<string, unknown>,
      })),
    };
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function parseOutput(raw: string): { featureFile: string; stepDefinitions: string } {
  const featureMatch = raw.match(/=== FEATURE FILE ===([\s\S]*?)(?:=== STEP DEFINITIONS ===|$)/i);
  const stepsMatch = raw.match(/=== STEP DEFINITIONS ===([\s\S]*?)$/i);

  return {
    featureFile: featureMatch ? featureMatch[1].trim() : raw,
    stepDefinitions: stepsMatch ? stepsMatch[1].trim() : '',
  };
}

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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
