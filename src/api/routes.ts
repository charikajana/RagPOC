import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { RAGChain } from '../rag/ragChain';
import { similaritySearch } from '../vectorStore/chromaClient';
import { ADOClient } from '../connectors/adoClient';

const router = Router();
const ragChain = new RAGChain();
const adoClient = new ADOClient();

// ─────────────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────────────
const GenerateTestSchema = z.object({
  storyId: z.number().int().positive(),
});

const SearchSchema = z.object({
  query: z.string().min(3),
  k: z.number().int().min(1).max(20).optional().default(5),
  source: z.enum(['azure-devops', 'feature-file', 'step-definition', 'documentation']).optional(),
});

// ─────────────────────────────────────────────
// POST /generate-test
// ─────────────────────────────────────────────
/**
 * @route POST /api/generate-test
 * @desc  Generate Gherkin feature file + TypeScript steps from an ADO story
 * @body  { storyId: number }
 */
router.post('/generate-test', async (req: Request, res: Response) => {
  try {
    const parsed = GenerateTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { storyId } = parsed.data;
    const result = await ragChain.generateTests(storyId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ /generate-test error:', message);
    return res.status(500).json({
      success: false,
      error: message,
    });
  }
});

// ─────────────────────────────────────────────
// POST /search
// ─────────────────────────────────────────────
/**
 * @route POST /api/search
 * @desc  Semantic search across the vector store
 * @body  { query: string, k?: number, source?: string }
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const parsed = SearchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { query, k, source } = parsed.data;
    const filter = source ? { source } : undefined;
    const results = await similaritySearch(query, k, filter);

    return res.json({
      success: true,
      data: {
        query,
        results: results.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
});

// ─────────────────────────────────────────────
// GET /story/:id
// ─────────────────────────────────────────────
/**
 * @route GET /api/story/:id
 * @desc  Fetch a single ADO work item by ID
 */
router.get('/story/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid story ID' });
    }

    const workItem = await adoClient.getWorkItem(id);
    return res.json({ success: true, data: workItem });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ success: false, error: message });
  }
});

// ─────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────
/**
 * @route GET /api/health
 * @desc  Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;
