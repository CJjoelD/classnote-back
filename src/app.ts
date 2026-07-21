import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import * as path from 'path';

import authRouter from './routes/auth';
import classesRouter from './routes/classes';
import tasksRouter from './routes/tasks';
import remindersRouter from './routes/reminders';
import groupsRouter from './routes/groups';
import devicesRouter from './routes/devices';
import analyticsRouter from './routes/analytics';
import adminRouter from './routes/admin';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter, authLimiter, uploadLimiter, heartbeatLimiter, adminLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';

const app = express();
const startTime = Date.now();

// 💡 CLAVE PARA RAILWAY: Confiar en el Reverse Proxy de Railway para obtener HTTPS y Host correcto
app.set('trust proxy', true);

// Seguridad: Permitir descarga de archivos multimedia (audios) desde orígenes cruzados (Vercel)
app.use(helmet({ 
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// CORS
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Ocultar X-Powered-By
app.disable('x-powered-by');

// Estáticos (Servir la carpeta uploads públicamente con cabeceras de origen cruzado para reproducción audio/media)
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Rate limiters por ruta
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/classes/upload-hardware', uploadLimiter);
app.use('/api/classes', classesRouter);
app.use('/api/tasks', generalLimiter, tasksRouter);
app.use('/api/reminders', generalLimiter, remindersRouter);
app.use('/api/groups', generalLimiter, groupsRouter);
app.use('/api/devices/heartbeat', heartbeatLimiter);
app.use('/api/devices', devicesRouter);
app.use('/api/analytics', generalLimiter, analyticsRouter);
app.use('/api/admin', adminLimiter, adminRouter);

// Health check mejorado
app.get('/health', async (_req, res) => {
  let dbStatus = 'ok';
  try {
    const { default: prisma } = await import('./config/prisma');
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    database: dbStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Métricas
app.get('/metrics', async (_req, res) => {
  try {
    const { default: prisma } = await import('./config/prisma');
    const mem = process.memoryUsage();
    const [users, devices, classes] = await Promise.all([
      prisma.user.count({ where: { id: { not: 'system' } } }),
      prisma.device.count(),
      prisma.class.count(),
    ]);

    res.json({
      uptime: Math.floor((Date.now() - startTime) / 1000),
      memory: {
        rss: `${(mem.rss / 1048576).toFixed(1)} MB`,
        heapUsed: `${(mem.heapUsed / 1048576).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1048576).toFixed(1)} MB`,
      },
      cpu: process.cpuUsage(),
      counts: { users, devices, classes },
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudieron obtener métricas.' });
  }
});

// 404 para rutas no encontradas
app.use(notFoundHandler);

// Error handler global (debe ser el último)
app.use(errorHandler);

export default app;