import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { AzureChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL,
  LLM_PROVIDER,
  GITHUB_TOKEN,
  GITHUB_MODEL,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_CHAT_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION,
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
  provider: string;
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
// LLM FACTORY — pick provider from .env
// ─────────────────────────────────────────────
function createLLM() {
  const provider = LLM_PROVIDER.toLowerCase();

  switch (provider) {

    // ── GitHub Models (GPT-4o via your GitHub account — FREE with Copilot) ──
    case 'github': {
      if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required for LLM_PROVIDER=github');
      console.log(`   🤖 LLM: GitHub Models (${GITHUB_MODEL}) — using your Copilot subscription`);
      return new ChatOpenAI({
        openAIApiKey: GITHUB_TOKEN,
        modelName:    GITHUB_MODEL,
        temperature:  0.2,
        maxTokens:    4096,
        configuration: {
          baseURL: 'https://models.inference.ai.azure.com',
        },
      });
    }

    // ── Azure OpenAI ─────────────────────────────────────────────────────────
    case 'azure': {
      if (!AZURE_OPENAI_API_KEY) throw new Error('AZURE_OPENAI_API_KEY required for LLM_PROVIDER=azure');
      console.log(`   🤖 LLM: Azure OpenAI (${AZURE_OPENAI_CHAT_DEPLOYMENT})`);
      return new AzureChatOpenAI({
        azureOpenAIApiKey:              AZURE_OPENAI_API_KEY,
        azureOpenAIEndpoint:            AZURE_OPENAI_ENDPOINT,
        azureOpenAIApiDeploymentName:   AZURE_OPENAI_CHAT_DEPLOYMENT,
        azureOpenAIApiVersion:          AZURE_OPENAI_API_VERSION,
        temperature: 0.2,
        maxTokens:   4096,
      });
    }

    // ── Anthropic / Claude (original default) ───────────────────────────────
    case 'anthropic':
    default: {
      if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required for LLM_PROVIDER=anthropic');
      console.log(`   🤖 LLM: Anthropic Claude (${ANTHROPIC_MODEL})`);
      return new ChatAnthropic({
        apiKey:      ANTHROPIC_API_KEY,
        model:       ANTHROPIC_MODEL,
        temperature: 0.2,
        maxTokens:   4096,
      });
    }
  }
}

// ─────────────────────────────────────────────
// RAG CHAIN
// ─────────────────────────────────────────────
export class RAGChain {
  private readonly adoClient: ADOClient;

  constructor() {
    this.adoClient = new ADOClient();
  }

  async generateTests(storyId: number): Promise<GenerateTestResult> {
    const provider = LLM_PROVIDER.toLowerCase();
    console.log(`\n🤖 Generating tests for Story #${storyId} [provider: ${provider}]...`);

    // ── Step 1: Fetch the User Story from ADO ────────────────────────────
    const workItem = await this.adoClient.getWorkItem(storyId);
    const fields = workItem.fields;
    const title               = fields['System.Title'] || '';
    const description         = stripHtml(fields['System.Description'] || '');
    const acceptanceCriteria  = stripHtml(fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '');
    const areaPath            = fields['System.AreaPath'] || '';
    const tags                = fields['System.Tags'] || '';

    console.log(`   📋 Title: ${title}`);
    console.log(`   📁 Area:  ${areaPath}`);

    // ── Step 2: Retrieve relevant context from ChromaDB ──────────────────
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
        console.warn('   ⚠️  Vector store query failed (run rag:ingest first)');
        break;
      }
    }

    const contextDocs = retrievedDocs.slice(0, 8);
    console.log(`   🔍 Retrieved ${contextDocs.length} relevant context chunks from your framework`);

    // ── Step 3: Build prompt ──────────────────────────────────────────────
    const contextText = contextDocs.length > 0
      ? contextDocs
          .map((doc, i) => {
            const src  = doc.metadata['source'] || 'unknown';
            const file = doc.metadata['filePath'] || '';
            return `[Context ${i + 1} — ${src} — ${file}]\n${doc.pageContent}`;
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

## RETRIEVED CONTEXT FROM YOUR FRAMEWORK (match this style exactly)
${contextText}

## YOUR TASK
Generate a complete Gherkin .feature file AND TypeScript step definitions for this User Story.
`;

    // ── Step 4: Call the configured LLM ──────────────────────────────────
    const llm = createLLM();

    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate('{userMessage}'),
    ]);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    console.log(`   ✨ Calling LLM...`);
    const rawOutput = await chain.invoke({ userMessage });

    // ── Step 5: Parse output ──────────────────────────────────────────────
    const { featureFile, stepDefinitions } = parseOutput(rawOutput);

    const modelName = provider === 'github'
      ? GITHUB_MODEL
      : provider === 'azure'
        ? AZURE_OPENAI_CHAT_DEPLOYMENT
        : ANTHROPIC_MODEL;

    return {
      storyId,
      storyTitle: title,
      featureFile,
      stepDefinitions,
      model:    modelName,
      provider: LLM_PROVIDER,
      retrievedChunks: contextDocs.map(doc => ({
        content:  doc.pageContent,
        source:   String(doc.metadata['source'] || ''),
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
  const stepsMatch   = raw.match(/=== STEP DEFINITIONS ===([\s\S]*?)$/i);
  return {
    featureFile:     featureMatch ? featureMatch[1].trim() : raw,
    stepDefinitions: stepsMatch   ? stepsMatch[1].trim()   : '',
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
