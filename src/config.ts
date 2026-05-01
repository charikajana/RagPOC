import dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────
// LLM PROVIDER SELECTOR
// Options: 'github' | 'anthropic' | 'azure'
// Set LLM_PROVIDER=github to use GitHub Models
// (same GPT-4o that Copilot uses — FREE with your Copilot subscription)
// ─────────────────────────────────────────────
export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';

// ─────────────────────────────────────────────
// GITHUB MODELS (Copilot — no extra cost!)
// Uses your GitHub Personal Access Token
// Get one: https://github.com/settings/tokens
// Scopes needed: (none — any classic PAT works)
// Models: gpt-4o | gpt-4o-mini | phi-3-medium
// ─────────────────────────────────────────────
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const GITHUB_MODEL = process.env.GITHUB_MODEL || 'gpt-4o';

// ─────────────────────────────────────────────
// ANTHROPIC (Claude API)
// ─────────────────────────────────────────────
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL   || 'claude-3-5-haiku-20241022';

// ─────────────────────────────────────────────
// AZURE OPENAI
// ─────────────────────────────────────────────
export const AZURE_OPENAI_API_KEY            = process.env.AZURE_OPENAI_API_KEY            || '';
export const AZURE_OPENAI_ENDPOINT           = process.env.AZURE_OPENAI_ENDPOINT           || '';
export const AZURE_OPENAI_CHAT_DEPLOYMENT    = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT    || 'gpt-4o';
export const AZURE_OPENAI_EMBEDDING_DEPLOYMENT = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || '';
export const AZURE_OPENAI_API_VERSION        = process.env.AZURE_OPENAI_API_VERSION        || '2024-02-01';

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
  const provider = LLM_PROVIDER.toLowerCase();

  // Provider-specific key check
  const providerKeys: Record<string, string> = {
    github:    GITHUB_TOKEN,
    anthropic: ANTHROPIC_API_KEY,
    azure:     AZURE_OPENAI_API_KEY,
  };

  if (!providerKeys[provider]) {
    console.warn(`⚠️  LLM_PROVIDER=${provider} but the required API key is missing.`);
    if (provider === 'github')    console.warn('   Set GITHUB_TOKEN in your .env');
    if (provider === 'anthropic') console.warn('   Set ANTHROPIC_API_KEY in your .env');
    if (provider === 'azure')     console.warn('   Set AZURE_OPENAI_API_KEY in your .env');
  } else {
    console.log(`✅ LLM Provider: ${provider.toUpperCase()} (${
      provider === 'github' ? GITHUB_MODEL
      : provider === 'azure' ? AZURE_OPENAI_CHAT_DEPLOYMENT
      : ANTHROPIC_MODEL
    })`);
  }

  // ADO is always required
  const adoRequired: Record<string, string> = { ADO_ORGANIZATION, ADO_PROJECT, ADO_PAT };
  const missing = Object.entries(adoRequired).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing ADO variables: ${missing.join(', ')}`);
  }
}
