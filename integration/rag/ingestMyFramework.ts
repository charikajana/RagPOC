/**
 * ingestMyFramework.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DROP THIS FILE into:  <YourFramework>/rag/ingestMyFramework.ts
 *
 * Ingests YOUR OWN framework's codebase into ChromaDB so the AI learns
 * your exact coding style, locators, step patterns, and test data.
 *
 * Run this:
 *   1. Once initially
 *   2. Whenever you add new feature files, steps, or test data
 *
 * Usage:
 *   npx ts-node rag/ingestMyFramework.ts
 *   npx ts-node rag/ingestMyFramework.ts --reset     (wipe + re-index)
 *   npx ts-node rag/ingestMyFramework.ts --dry-run   (preview only)
 *
 * Or add to package.json:
 *   "rag:ingest": "ts-node rag/ingestMyFramework.ts"
 *   npm run rag:ingest
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from 'dotenv';
dotenv.config();

import * as path from 'path';
import * as fs   from 'fs';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// Point RAG_POC_PATH to where you cloned the RagPOC project.
// You can set this in your .env file as RAG_POC_PATH=C:\...\RagPOC
// ─────────────────────────────────────────────────────────────────────────────
const RAG_POC_PATH = process.env.RAG_POC_PATH ?? '';
const FRAMEWORK_ROOT = process.cwd(); // your framework root

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    reset:  args.includes('--reset'),
    dryRun: args.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   📂 Framework Self-Ingestion                ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const { reset, dryRun } = parseArgs();

  if (!RAG_POC_PATH) {
    console.error('❌ RAG_POC_PATH is not set.');
    console.error('   Add this to your .env file:');
    console.error('   RAG_POC_PATH=C:\\path\\to\\RagPOC\n');
    process.exit(1);
  }

  const ragPocPath = path.resolve(RAG_POC_PATH);
  if (!fs.existsSync(ragPocPath)) {
    console.error(`❌ RagPOC not found at: ${ragPocPath}`);
    process.exit(1);
  }

  console.log(`📂 Framework root : ${FRAMEWORK_ROOT}`);
  console.log(`📂 RagPOC path    : ${ragPocPath}`);
  if (reset)  console.log('🗑️   Mode: RESET — will wipe existing ChromaDB collection');
  if (dryRun) console.log('🧪  Mode: DRY RUN — no embedding will happen');
  console.log('');

  // Build the ingest:repo command to run inside the RagPOC project
  const flags = [
    `--repo "${FRAMEWORK_ROOT}"`,
    reset  ? '--reset'   : '',
    dryRun ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  const command = `npm run ingest:repo -- ${flags}`;

  console.log(`🚀 Running: ${command}`);
  console.log(`   (inside: ${ragPocPath})\n`);

  try {
    execSync(command, {
      cwd:   ragPocPath,
      stdio: 'inherit',   // stream output to this terminal
      shell: 'cmd.exe',
    });
  } catch (err) {
    console.error('\n❌ Ingestion failed. Make sure RagPOC dependencies are installed.');
    console.error('   Run: cd ' + ragPocPath + ' && npm install');
    process.exit(1);
  }

  console.log('\n✅ Your framework has been indexed into ChromaDB.');
  console.log('   The AI will now generate tests matching YOUR exact coding style.\n');
}

main().catch(err => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
