import dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────
// ANTHROPIC (Claude API)
// ─────────────────────────────────────────────
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Model options:
//   claude-3-5-haiku-20241022   ← fastest, cheapest  (~$0.001 per test gen)
//   claude-3-5-sonnet-20241022  ← best quality
//   claude-3-opus-20240229      ← most powerful
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

// ─────────────────────────────────────────────
// OLLAMA (Local Embeddings — FREE, no API key)
// ─────────────────────────────────────────────
// Install Ollama: https://ollama.com/download
// Then run:  ollama pull nomic-embed-text
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
export const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

// ─────────────────────────────────────────────
// AZURE DEVOPS
// ─────────────────────────────────────────────
export const ADO_ORGANIZATION = process.env.ADO_ORGANIZATION || '';
export const ADO_PROJECT = process.env.ADO_PROJECT || '';
export const ADO_PAT = process.env.ADO_PAT || '';

// ─────────────────────────────────────────────
// VECTOR DATABASE (CHROMADB)
// ─────────────────────────────────────────────
export const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000';
export const CHROMA_COLLECTION_NAME = process.env.CHROMA_COLLECTION_NAME || 'rag_test_automation';

// ─────────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────────
export const PORT = parseInt(process.env.PORT || '3001', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';

// ─────────────────────────────────────────────
// KNOWLEDGE BASE PATHS
// ─────────────────────────────────────────────
export const FEATURES_PATH = process.env.FEATURES_PATH || './knowledge/features';
export const STEPS_PATH = process.env.STEPS_PATH || './knowledge/steps';
export const DOCS_PATH = process.env.DOCS_PATH || './knowledge/docs';

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────
export function validateConfig(): void {
  const required: Record<string, string> = {
    ANTHROPIC_API_KEY,
    ADO_ORGANIZATION,
    ADO_PROJECT,
    ADO_PAT,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('   Copy .env.example to .env and fill in the values.');
  }
}
