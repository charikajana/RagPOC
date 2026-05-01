/**
 * ingestADO.ts
 * ─────────────────────────────────────────────────────────────────────
 * Pulls User Stories (and optionally Epics) from Azure DevOps,
 * chunks them, embeds them, and stores them in ChromaDB.
 *
 * Usage:
 *   npm run ingest:ado
 *   npm run ingest:ado -- --area "MyProject\Backend"
 *   npm run ingest:ado -- --story 12345
 *   npm run ingest:ado -- --epics
 */

import dotenv from 'dotenv';
dotenv.config();

import { ADOLoader } from '../connectors/adoLoader';
import { getOrCreateVectorStore, addDocumentsToStore, getVectorStore } from '../vectorStore/chromaClient';
import { Document } from '@langchain/core/documents';

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════');
  console.log('  📡 ADO Ingestion Pipeline');
  console.log('══════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const areaIdx = args.indexOf('--area');
  const storyIdx = args.indexOf('--story');
  const epicsFlag = args.includes('--epics');
  const resetFlag = args.includes('--reset');

  const areaPath = areaIdx !== -1 ? args[areaIdx + 1] : undefined;
  const singleStoryId = storyIdx !== -1 ? parseInt(args[storyIdx + 1], 10) : undefined;

  const loader = new ADOLoader();
  let documents: Document[] = [];

  if (singleStoryId) {
    // Ingest a single story
    console.log(`📌 Mode: Single Story #${singleStoryId}`);
    documents = await loader.loadStory(singleStoryId);
  } else {
    // Ingest all stories (and optionally epics)
    console.log(`📌 Mode: All User Stories${areaPath ? ` (Area: ${areaPath})` : ''}`);
    documents = await loader.loadAllStories(areaPath);

    if (epicsFlag) {
      console.log('📌 Also loading Epics...');
      const epicDocs = await loader.loadAllEpics();
      documents.push(...epicDocs);
    }
  }

  if (documents.length === 0) {
    console.log('⚠️  No documents to ingest. Check your ADO credentials and project settings.');
    process.exit(0);
  }

  console.log(`\n📦 Total chunks to embed: ${documents.length}`);

  if (resetFlag) {
    // Create fresh collection
    console.log('🔄 Resetting collection and re-indexing...');
    await getOrCreateVectorStore(documents);
  } else {
    // Add to existing collection
    console.log('➕ Adding to existing collection...');
    try {
      await addDocumentsToStore(documents);
    } catch {
      // Collection doesn't exist yet — create it
      console.log('   Collection not found, creating new one...');
      await getOrCreateVectorStore(documents);
    }
  }

  console.log('\n✅ ADO ingestion complete!');
  console.log(`   ${documents.length} chunks indexed into ChromaDB`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Ingestion failed:', err.message || err);
  process.exit(1);
});
