/**
 * ingestFeatures.ts
 * ─────────────────────────────────────────────────────────────────────
 * Loads your existing Cucumber .feature files and TypeScript step
 * definitions into ChromaDB so the AI learns your framework's style.
 *
 * Usage:
 *   npm run ingest:features
 *   npm run ingest:features -- --features ./path/to/features
 *   npm run ingest:features -- --steps ./path/to/steps
 */

import dotenv from 'dotenv';
dotenv.config();

import { FrameworkLoader } from '../connectors/frameworkLoader';
import { getOrCreateVectorStore, addDocumentsToStore } from '../vectorStore/chromaClient';
import { FEATURES_PATH, STEPS_PATH } from '../config';
import { Document } from '@langchain/core/documents';

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════');
  console.log('  📂 Framework Ingestion Pipeline');
  console.log('══════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const featuresIdx = args.indexOf('--features');
  const stepsIdx = args.indexOf('--steps');

  const featuresPath = featuresIdx !== -1 ? args[featuresIdx + 1] : FEATURES_PATH;
  const stepsPath = stepsIdx !== -1 ? args[stepsIdx + 1] : STEPS_PATH;

  const loader = new FrameworkLoader();
  const documents: Document[] = [];

  // Load .feature files
  console.log(`📁 Loading feature files from: ${featuresPath}`);
  const featureDocs = await loader.loadFeatureFiles(featuresPath);
  documents.push(...featureDocs);

  // Load step definitions
  console.log(`\n📁 Loading step definitions from: ${stepsPath}`);
  const stepDocs = await loader.loadStepDefinitions(stepsPath);
  documents.push(...stepDocs);

  if (documents.length === 0) {
    console.log('\n⚠️  No documents found. Check your paths:');
    console.log(`   Features: ${featuresPath}`);
    console.log(`   Steps:    ${stepsPath}`);
    console.log('\n   Place your .feature files in knowledge/features/');
    console.log('   Place your step .ts files in knowledge/steps/');
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

  console.log('\n✅ Framework ingestion complete!');
  console.log(`   Features: ${featureDocs.length} chunks`);
  console.log(`   Steps:    ${stepDocs.length} chunks`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Framework ingestion failed:', err.message || err);
  process.exit(1);
});
