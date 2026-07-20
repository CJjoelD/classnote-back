import * as dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './utils/validateEnv';
validateEnv();

import app from './app';
import prisma from './config/prisma';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 5000;

async function ensureSystemUser() {
  try {
    const existing = await prisma.user.findUnique({ where: { id: 'system' } });
    if (!existing) {
      await prisma.user.create({
        data: {
          id: 'system',
          email: 'system@classnote.local',
          name: 'ClassNote System',
          role: 'student'
        }
      });
      logger.info('SYSTEM', 'Usuario "system" creado');
    }
  } catch (error) {
    logger.error('SYSTEM', 'Error creando usuario system', error);
  }
}

async function start() {
  await ensureSystemUser();

  // Cron: marcar dispositivos offline despues de 10s sin heartbeat
  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - 10_000);
      const result = await prisma.device.updateMany({
        where: { isOnline: true, lastSeenAt: { lt: threshold } },
        data: { isOnline: false }
      });
      if (result.count > 0) {
        logger.info('CRON', `${result.count} dispositivo(s) marcado(s) como offline`);
      }
    } catch (error) {
      logger.error('CRON', 'Error en cleanup de dispositivos', error);
    }
  }, 10_000);

  app.listen(Number(PORT), '0.0.0.0', () => {
    logger.info('SERVER', `ClassNote Backend corriendo en http://0.0.0.0:${PORT}`);
    logger.info('SERVER', `Health: http://localhost:${PORT}/health`);
    logger.info('SERVER', `Metrics: http://localhost:${PORT}/metrics`);
  });
}

start();
