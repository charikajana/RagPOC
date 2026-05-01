/**
 * generateTest.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DROP THIS FILE into:  <YourFramework>/rag/generateTest.ts
 *
 * CLI script — run from YOUR framework root to generate tests.
 *
 * Usage:
 *   npx ts-node rag/generateTest.ts --story 1234
 *   npx ts-node rag/generateTest.ts --story 1234 --overwrite
 *   npx ts-node rag/generateTest.ts --story 1234 --features src/test/features --steps src/test/steps
 *   npx ts-node rag/generateTest.ts --search "user login flow"
 *
 * Or add to your package.json scripts:
 *   "rag:generate": "ts-node rag/generateTest.ts"
 *
 * Then run:
 *   npm run rag:generate -- --story 1234
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from 'dotenv';
dotenv.config(); // loads .env from your framework root

import { RagClient } from './ragClient';

// ─────────────────────────────────────────────────────────────────────────────
// Parse CLI arguments
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);

  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const has = (flag: string) => args.includes(flag);

  return {
    storyId:     get('--story'),
    searchQuery: get('--search'),
    featuresDir: get('--features'),
    stepsDir:    get('--steps'),
    overwrite:   has('--overwrite'),
    k:           parseInt(get('--k') ?? '5', 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   🤖 RAG Test Generator                      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const args = parseArgs();

  // Build client — reads paths from .env or CLI flags
  const rag = new RagClient({
    featuresDir: args.featuresDir,
    stepsDir:    args.stepsDir,
    overwrite:   args.overwrite,
  });

  // ── Check RAG engine is running ──────────────────────────────────────────
  const healthy = await rag.isHealthy();
  if (!healthy) {
    console.error('❌ RAG Engine is NOT running at http://localhost:3001');
    console.error('   Start it first:');
    console.error('   cd <path-to-RagPOC> && npm run dev\n');
    process.exit(1);
  }
  console.log('✅ RAG Engine is running\n');

  // ── Mode 1: Generate test from ADO story ─────────────────────────────────
  if (args.storyId) {
    const storyId = parseInt(args.storyId, 10);
    if (isNaN(storyId)) {
      console.error(`❌ Invalid story ID: "${args.storyId}". Must be a number.`);
      process.exit(1);
    }

    await rag.generateAndSave(storyId);
    return;
  }

  // ── Mode 2: Semantic search ───────────────────────────────────────────────
  if (args.searchQuery) {
    console.log(`🔍 Searching for: "${args.searchQuery}" (top ${args.k})\n`);
    const results = await rag.search(args.searchQuery, args.k);

    if (results.length === 0) {
      console.log('⚠️  No results found. Run ingestion scripts first.');
    } else {
      results.forEach((r, i) => {
        console.log(`─── Result ${i + 1} [${r.source}] ─────────────────────`);
        console.log(`File: ${r.metadata['filePath'] ?? 'unknown'}`);
        console.log(r.content.substring(0, 300));
        console.log();
      });
    }
    return;
  }

  // ── No valid mode — show help ─────────────────────────────────────────────
  console.log('Usage:');
  console.log('  Generate test:   ts-node rag/generateTest.ts --story 1234');
  console.log('  Semantic search: ts-node rag/generateTest.ts --search "login flow"');
  console.log('');
  console.log('Options:');
  console.log('  --story     <id>    ADO story ID to generate tests for');
  console.log('  --search    <text>  Semantic search query');
  console.log('  --features  <path>  Override output folder for .feature files');
  console.log('  --steps     <path>  Override output folder for step .ts files');
  console.log('  --overwrite         Overwrite existing files');
  console.log('  --k         <num>   Number of search results (default: 5)');
}

main().catch((err) => {
  console.error('\n❌ Failed:', err.message ?? err);
  process.exit(1);
});
