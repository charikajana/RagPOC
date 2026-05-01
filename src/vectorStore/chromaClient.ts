import { OllamaEmbeddings } from '@langchain/ollama';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Document } from '@langchain/core/documents';
import {
  OLLAMA_BASE_URL,
  OLLAMA_EMBEDDING_MODEL,
  CHROMA_URL,
  CHROMA_COLLECTION_NAME,
} from '../config';

let vectorStoreInstance: Chroma | null = null;

/**
 * Returns Ollama local embeddings.
 * Model: nomic-embed-text (768-dim, excellent quality, ~274MB)
 *
 * Setup (one-time):
 *   1. Install Ollama from https://ollama.com/download
 *   2. Run: ollama pull nomic-embed-text
 */
export function getEmbeddings(): OllamaEmbeddings {
  return new OllamaEmbeddings({
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_EMBEDDING_MODEL,
  });
}

/**
 * Returns a singleton ChromaDB vector store instance.
 */
export async function getVectorStore(): Promise<Chroma> {
  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  const embeddings = getEmbeddings();

  vectorStoreInstance = await Chroma.fromExistingCollection(embeddings, {
    collectionName: CHROMA_COLLECTION_NAME,
    url: CHROMA_URL,
  });

  return vectorStoreInstance;
}

/**
 * Creates or resets the ChromaDB collection.
 * Used by ingestion scripts to initialize a fresh vector store.
 */
export async function getOrCreateVectorStore(documents?: Document[]): Promise<Chroma> {
  const embeddings = getEmbeddings();

  if (documents && documents.length > 0) {
    vectorStoreInstance = await Chroma.fromDocuments(documents, embeddings, {
      collectionName: CHROMA_COLLECTION_NAME,
      url: CHROMA_URL,
    });
  } else {
    vectorStoreInstance = await Chroma.fromExistingCollection(embeddings, {
      collectionName: CHROMA_COLLECTION_NAME,
      url: CHROMA_URL,
    });
  }

  return vectorStoreInstance;
}

/**
 * Adds new documents to an existing vector store without resetting it.
 */
export async function addDocumentsToStore(documents: Document[]): Promise<void> {
  const store = await getVectorStore();
  await store.addDocuments(documents);
  console.log(`✅ Added ${documents.length} documents to vector store`);
}

/**
 * Performs a similarity search and returns the top-K matching documents.
 */
export async function similaritySearch(
  query: string,
  k: number = 5,
  filter?: Record<string, unknown>
): Promise<Document[]> {
  const store = await getVectorStore();
  return store.similaritySearch(query, k, filter);
}
