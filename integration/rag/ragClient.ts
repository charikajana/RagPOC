/**
 * ragClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DROP THIS FILE into:  <YourFramework>/rag/ragClient.ts
 *
 * This is the HTTP bridge between your Cucumber framework and the RAG engine.
 * The RAG engine runs separately (npm run dev inside RagPOC folder).
 *
 * Usage in any script:
 *   import { RagClient } from './rag/ragClient';
 *   const rag = new RagClient();
 *   await rag.generateAndSave(1234);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs   from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface GeneratedTest {
  storyId:         number;
  storyTitle:      string;
  featureFile:     string;
  stepDefinitions: string;
  model:           string;
  retrievedChunks: Array<{
    content:  string;
    source:   string;
    metadata: Record<string, unknown>;
  }>;
}

export interface SearchResult {
  content:  string;
  source:   string;
  metadata: Record<string, unknown>;
}

export interface RagClientConfig {
  /** RAG engine base URL. Default: http://localhost:3001 */
  baseUrl?:      string;
  /** Where to save generated .feature files inside your framework */
  featuresDir?:  string;
  /** Where to save generated step definition .ts files */
  stepsDir?:     string;
  /** If true, overwrite existing files with the same name */
  overwrite?:    boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RagClient
// ─────────────────────────────────────────────────────────────────────────────
export class RagClient {
  private readonly baseUrl:     string;
  private readonly featuresDir: string;
  private readonly stepsDir:    string;
  private readonly overwrite:   boolean;

  constructor(config: RagClientConfig = {}) {
    // Read from env vars first, then config, then sensible defaults
    this.baseUrl     = config.baseUrl     ?? process.env.RAG_ENGINE_URL  ?? 'http://localhost:3001';
    this.featuresDir = config.featuresDir ?? process.env.RAG_FEATURES_OUT ?? './features';
    this.stepsDir    = config.stepsDir    ?? process.env.RAG_STEPS_OUT    ?? './steps';
    this.overwrite   = config.overwrite   ?? false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // generateAndSave
  // Call the RAG engine, then write .feature + step .ts into YOUR framework
  // ───────────────────────────────────────────────────────────────────────────
  async generateAndSave(storyId: number): Promise<GeneratedTest> {
    console.log(`\n🤖 RAG: Generating tests for Story #${storyId}...`);

    const result = await this.generateTest(storyId);

    // Build safe file name from story title
    const safeName = this.toFileName(result.storyTitle, storyId);

    // Save .feature file
    const featurePath = path.resolve(this.featuresDir, `${safeName}.feature`);
    this.writeFile(featurePath, result.featureFile);

    // Save step definitions .ts file
    const stepsPath = path.resolve(this.stepsDir, `${safeName}.steps.ts`);
    this.writeFile(stepsPath, result.stepDefinitions);

    console.log(`\n✅ RAG generation complete!`);
    console.log(`   📄 Feature : ${featurePath}`);
    console.log(`   📄 Steps   : ${stepsPath}`);
    console.log(`   🤖 Model   : ${result.model}`);
    console.log(`   📦 Chunks  : ${result.retrievedChunks.length} context chunks used\n`);

    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // generateTest — raw API call, returns the generated content
  // ───────────────────────────────────────────────────────────────────────────
  async generateTest(storyId: number): Promise<GeneratedTest> {
    const url = `${this.baseUrl}/api/generate-test`;

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ storyId }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RAG Engine error (${response.status}): ${error}`);
    }

    const json = await response.json() as { success: boolean; data: GeneratedTest; error?: string };

    if (!json.success) {
      throw new Error(`RAG Engine returned failure: ${json.error ?? 'unknown'}`);
    }

    return json.data;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // search — semantic search across all indexed knowledge
  // ───────────────────────────────────────────────────────────────────────────
  async search(
    query:   string,
    k:       number = 5,
    source?: string,
  ): Promise<SearchResult[]> {
    const url = `${this.baseUrl}/api/search`;

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, k, source }),
    });

    if (!response.ok) {
      throw new Error(`RAG search error (${response.status})`);
    }

    const json = await response.json() as { success: boolean; data: SearchResult[] };
    return json.data;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // health — check if RAG engine is running
  // ───────────────────────────────────────────────────────────────────────────
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────── helpers ────────────────────────────
  private writeFile(filePath: string, content: string): void {
    if (!this.overwrite && fs.existsSync(filePath)) {
      console.warn(`   ⚠️  Skipping (already exists): ${filePath}`);
      console.warn(`      Use overwrite: true to replace it.`);
      return;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  private toFileName(title: string, storyId: number): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 60);

    return `story-${storyId}-${slug}`;
  }
}
