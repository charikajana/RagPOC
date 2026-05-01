import express from 'express';
import cors from 'cors';
import { validateConfig, PORT, NODE_ENV } from './config';
import apiRouter from './api/routes';

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
async function main(): Promise<void> {
  // Validate required config on startup
  validateConfig();

  const app = express();

  // ── Middleware ─────────────────────────────
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging (dev only) ─────────────
  if (NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      console.log(`➡️  ${req.method} ${req.path}`);
      next();
    });
  }

  // ── API Routes ─────────────────────────────
  app.use('/api', apiRouter);

  // ── Root ───────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      name: 'RAG Engine for AI-Driven Test Automation',
      version: '1.0.0',
      endpoints: {
        health: 'GET /api/health',
        generateTest: 'POST /api/generate-test',
        search: 'POST /api/search',
        getStory: 'GET /api/story/:id',
      },
      docs: 'See README.md for full API documentation',
    });
  });

  // ── 404 handler ────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // ── Global error handler ───────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('💥 Unhandled error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  });

  // ── Start listening ────────────────────────
  app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   🤖 RAG Engine — Test Automation AI Agent    ║');
    console.log('╠═══════════════════════════════════════════════╣');
    console.log(`║   🌐 Server:   http://localhost:${PORT}           ║`);
    console.log(`║   🔧 Mode:     ${NODE_ENV.padEnd(32)}║`);
    console.log('╠═══════════════════════════════════════════════╣');
    console.log('║   Endpoints:                                   ║');
    console.log('║   POST /api/generate-test                      ║');
    console.log('║   POST /api/search                             ║');
    console.log('║   GET  /api/story/:id                          ║');
    console.log('║   GET  /api/health                             ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
  });
}

main().catch((err) => {
  console.error('💥 Fatal startup error:', err);
  process.exit(1);
});
