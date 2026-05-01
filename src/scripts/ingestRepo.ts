/**
 * ingestRepo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One-command ingestion of an ENTIRE automation framework repository.
 *
 * It auto-discovers:
 *   ✅  .feature files
 *   ✅  Step definitions (.ts / .js / .java)
 *   ✅  Action classes
 *   ✅  Healer classes
 *   ✅  Locator / Page-Object classes
 *   ✅  Test data (JSON, XML, YAML, CSV, Excel-like)
 *   ✅  REST API request configs / payloads
 *   ✅  SOAP / WSDL configs
 *   ✅  File-upload fixtures
 *   ✅  Configuration / properties files
 *   ✅  Utility / Helper classes
 *
 * Usage:
 *   npm run ingest:repo -- --repo "C:\path\to\your\AutomationFramework"
 *
 * Optional flags:
 *   --repo   <path>   Root of the framework repo  (required)
 *   --reset           Wipe existing ChromaDB collection first
 *   --dry-run         Discover folders only, do NOT embed
 *   --source <type>   Ingest only a specific source type
 *                     e.g. --source feature-file
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from 'dotenv';
dotenv.config();

import { RepoLoader, SourceType } from '../connectors/repoLoader';
import {
  getOrCreateVectorStore,
  addDocumentsToStore,
} from '../vectorStore/chromaClient';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { getEmbeddings } from '../vectorStore/chromaClient';
import { CHROMA_URL, CHROMA_COLLECTION_NAME } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Parse CLI arguments
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);

  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const has = (flag: string): boolean => args.includes(flag);

  return {
    repoPath:   get('--repo'),
    sourceFilter: get('--source') as SourceType | undefined,
    reset:      has('--reset'),
    dryRun:     has('--dry-run'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   🗂️  Full Repository Ingestion Pipeline          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const { repoPath, sourceFilter, reset, dryRun } = parseArgs();

  if (!repoPath) {
    console.error('❌  --repo argument is required.');
    console.error('    Example:');
    console.error('    npm run ingest:repo -- --repo "C:\\MyAutomation\\Framework"\n');
    process.exit(1);
  }

  console.log(`📂  Repo root : ${repoPath}`);
  if (sourceFilter) console.log(`🔍  Filter    : source = "${sourceFilter}"`);
  if (reset)        console.log(`🗑️   Reset     : ChromaDB collection will be wiped`);
  if (dryRun)       console.log(`🧪  Dry-run   : discovery only — nothing will be embedded`);
  console.log('');

  // 1. Discover folders
  const loader = new RepoLoader(repoPath);
  let folders = loader.discoverFolders();

  if (folders.length === 0) {
    console.warn('⚠️  No recognisable folders found in the given repo.');
    console.warn('    Make sure folder names match patterns like:');
    console.warn('    features/, steps/, actions/, locators/, testData/, config/ ...\n');
    process.exit(0);
  }

  // 2. Apply source filter if requested
  if (sourceFilter) {
    folders = folders.filter(f => f.source === sourceFilter);
    console.log(`\n📌 After filter: ${folders.length} folder(s) match source="${sourceFilter}"\n`);
  }

  // 3. Dry-run → just print discovery table and exit
  if (dryRun) {
    console.log('\n✅  Dry-run complete. No data was embedded.');
    console.log('    Run without --dry-run to embed everything.\n');
    process.exit(0);
  }

  // 4. Load all documents
  console.log('\n📖  Loading files...\n');
  const documents = await loader.loadAll(folders);

  if (documents.length === 0) {
    console.warn('⚠️  No embeddable content found. Check file types in those folders.');
    process.exit(0);
  }

  // Print summary by source type
  const summary = documents.reduce<Record<string, number>>((acc, doc) => {
    const src = doc.metadata.source as string;
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});

  console.log('\n📊  Chunks ready to embed:');
  Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([src, count]) => {
      console.log(`   ${src.padEnd(20)} ${count} chunks`);
    });
  console.log(`${''.padEnd(40, '─')}`);
  console.log(`   ${'TOTAL'.padEnd(20)} ${documents.length} chunks\n`);

  // 5. Embed into ChromaDB
  console.log('🚀  Embedding into ChromaDB...\n');

  if (reset) {
    // Wipe existing collection and recreate
    console.log('🗑️   Resetting collection...');
    try {
      const embeddings = getEmbeddings();
      const existing = await Chroma.fromExistingCollection(embeddings, {
        collectionName: CHROMA_COLLECTION_NAME,
        url: CHROMA_URL,
      });
      await existing.delete({ filter: {} });
    } catch {
      // Collection may not exist yet — that's fine
    }
    await getOrCreateVectorStore(documents);
  } else {
    try {
      await addDocumentsToStore(documents);
    } catch {
      console.log('   Collection not found, creating fresh...');
      await getOrCreateVectorStore(documents);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   ✅  Repository ingestion complete!              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n   Total chunks embedded : ${documents.length}`);
  console.log(`   ChromaDB collection   : ${CHROMA_COLLECTION_NAME}`);
  console.log(`   ChromaDB URL          : ${CHROMA_URL}\n`);
}

main().catch((err) => {
  console.error('\n❌  Repo ingestion failed:', err.message ?? err);
  process.exit(1);
});
