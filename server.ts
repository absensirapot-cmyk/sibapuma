import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleAiStatus,
  handleGenerateQuestions,
  handleRefineQuestion,
  handleParseExamDocument,
} from './server/aiHandlers.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

/**
 * Healthcheck & Configuration status
 */
app.get('/api/ai/status', (_req, res) => {
  const result = handleAiStatus();
  return res.status(result.status).json(result.data);
});

/**
 * Direct Gemini Question Generation Endpoint (HOTS + Visual Charts, Tables, SVG Illustrations & Case Studies)
 */
app.post('/api/ai/generate-questions', async (req, res) => {
  const result = await handleGenerateQuestions(req.body);
  return res.status(result.status).json(result.data);
});

/**
 * Single-Question AI Refine / Upgrade Endpoint (for EditUjianModal & Draft Editor)
 */
app.post('/api/ai/refine-question', async (req, res) => {
  const result = await handleRefineQuestion(req.body);
  return res.status(result.status).json(result.data);
});

/**
 * Intelligent Document Exam Parser using Gemini AI
 */
app.post('/api/ai/parse-exam-document', async (req, res) => {
  const result = await handleParseExamDocument(req.body);
  return res.status(result.status).json(result.data);
});

/**
 * Start Server with Vite Middleware in Development or Static Files in Production
 */
async function startServer() {
  // Ensure unmatched /api/* routes always return JSON instead of HTML or empty body
  app.all('/api/*', (_req, res) => {
    return res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  // Global JSON error handler (prevents empty response bodies on malformed JSON / payload errors)
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    return res.status(status).json({
      error: err?.message || 'Terjadi kesalahan internal pada server.',
    });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isDevLifecycle = process.env.npm_lifecycle_event === 'dev';
  const isProduction =
    !isDevLifecycle &&
    (process.env.NODE_ENV === 'production' ||
      (hasDist && (process.env.npm_lifecycle_event === 'start' || Boolean(process.env.K_SERVICE))));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log(`[Vite Dev] Middleware attached.`);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log(`[Production] Serving static bundle from ${distPath}`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SMK Bakti Putra Mandiri Server is running on http://0.0.0.0:${PORT}`);
  });
  server.requestTimeout = 300000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer();
