/**
 * ingestDocs.ts
 * ─────────────────────────────────────────────────────────────────────
 * Loads business rule documents (PDF, Markdown, TXT) into ChromaDB.
 *
 * Usage:
 *   npm run ingest:docs
 *   npm run ingest:docs -- --docs ./path/to/docs
 */

import dotenv from 'dotenv';
dotenv.config();

import { FrameworkLoader } from '../connectors/frameworkLoader';
import { getOrCreateVectorStore, addDocumentsToStore } from '../vectorStore/chromaClient';
import { DOCS_PATH } from '../config';

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════');
  console.log('  📄 Documentation Ingestion Pipeline');
  console.log('══════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const docsIdx = args.indexOf('--docs');
  const docsPath = docsIdx !== -1 ? args[docsIdx + 1] : DOCS_PATH;

  console.log(`📁 Loading docs from: ${docsPath}`);

  const loader = new FrameworkLoader();
  const documents = await loader.loadDocs(docsPath);

  if (documents.length === 0) {
    console.log('\n⚠️  No documents found.');
    console.log(`   Place PDF / Markdown / TXT files in: ${docsPath}`);
    process.exit(0);
  }

  console.log(`\n📦 Total chunks to embed: ${documents.length}`);
  console.log('   Adding to ChromaDB...');

  try {
    await addDocumentsToStore(documents);
  } catch {
    console.log('   Collection not found, creating new one...');
    await getOrCreateVectorStore(documents);
  }

  console.log('\n✅ Documentation ingestion complete!');
  console.log(`   ${documents.length} chunks indexed`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Docs ingestion failed:', err.message || err);
  process.exit(1);
});
