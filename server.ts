import express, { Request, Response } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { toolsRouter } from './server/routes/tools';
import { retellRouter } from './server/routes/retell';
import { dashboardApiRouter } from './server/routes/api';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Parse cookies and JSON bodies
app.use(cookieParser());
app.use(express.json());

// Request logger for API calls
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Keep logs clean and avoid leaking sensitive data
    if (!req.path.includes('/health')) {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Mount CareCall API routes
app.use('/api/tools', toolsRouter);
app.use('/api/webhooks', retellRouter);
app.use('/api/calls', retellRouter);
app.use('/api', dashboardApiRouter);

async function startServer() {
  if (!isProduction) {
    // Mount Vite dev middleware in development
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend build in production
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareCall server listening on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CareCall server:', err);
  process.exit(1);
});
