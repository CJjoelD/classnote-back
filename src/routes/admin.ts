import { Router, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Todos los endpoints requieren autenticación
router.use(authenticateToken);

// GET /api/admin/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const [
      users,
      companies,
      classes,
      devices,
      onlineDevices,
      processedClasses,
      pendingClasses,
    ] = await Promise.all([
      prisma.user.count({ where: { id: { not: 'system' } } }),
      prisma.user.count({ where: { role: 'company' } }),
      prisma.class.count(),
      prisma.device.count(),
      prisma.device.count({ where: { isOnline: true } }),
      prisma.class.count({ where: { status: 'Listo' } }),
      prisma.class.count({ where: { status: { in: ['Pendiente', 'Procesando'] } } }),
    ]);

    // Calcular almacenamiento en disco
    let storageUsed = '0 B';
    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        let totalBytes = 0;
        for (const file of files) {
          const stats = fs.statSync(path.join(UPLOADS_DIR, file));
          if (stats.isFile()) totalBytes += stats.size;
        }
        if (totalBytes >= 1073741824) {
          storageUsed = `${(totalBytes / 1073741824).toFixed(1)} GB`;
        } else if (totalBytes >= 1048576) {
          storageUsed = `${(totalBytes / 1048576).toFixed(1)} MB`;
        } else {
          storageUsed = `${(totalBytes / 1024).toFixed(1)} KB`;
        }
      }
    } catch { storageUsed = 'Sin datos'; }

    return res.json({
      users,
      companies,
      classes,
      devices,
      onlineDevices,
      processedClasses,
      pendingClasses,
      storageUsed,
    });
  } catch (error) {
    logger.error('ADMIN DASHBOARD', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener dashboard.' });
  }
});

// GET /api/admin/activity
router.get('/activity', async (req: AuthRequest, res: Response) => {
  try {
    const [recentClasses, recentUsers, recentDevices] = await Promise.all([
      prisma.class.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, title: true, status: true, updatedAt: true }
      }),
      prisma.user.findMany({
        where: { id: { not: 'system' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, createdAt: true }
      }),
      prisma.device.findMany({
        orderBy: { lastSeenAt: 'desc' },
        take: 5,
        select: { id: true, deviceId: true, isOnline: true, lastSeenAt: true }
      }),
    ]);

    const activity: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      createdAt: Date;
    }> = [];

    for (const c of recentClasses) {
      if (c.status === 'Listo') {
        activity.push({
          id: c.id,
          type: 'class_processed',
          title: 'Clase procesada',
          description: c.title,
          createdAt: c.updatedAt,
        });
      } else if (c.status === 'Procesando') {
        activity.push({
          id: c.id,
          type: 'class_processing',
          title: 'Clase en procesamiento',
          description: c.title,
          createdAt: c.updatedAt,
        });
      }
    }

    for (const u of recentUsers) {
      activity.push({
        id: u.id,
        type: 'user_registered',
        title: 'Nuevo usuario registrado',
        description: u.name || u.email,
        createdAt: u.createdAt,
      });
    }

    for (const d of recentDevices) {
      if (d.isOnline) {
        activity.push({
          id: d.id,
          type: 'device_connected',
          title: 'Dispositivo conectado',
          description: d.deviceId,
          createdAt: d.lastSeenAt || new Date(),
        });
      }
    }

    activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json(activity.slice(0, 20));
  } catch (error) {
    logger.error('ADMIN ACTIVITY', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener actividad.' });
  }
});

// GET /api/admin/system
router.get('/system', async (req: AuthRequest, res: Response) => {
  try {
    // Verificar DB con una query ligera
    let dbStatus = 'online';
    try { await prisma.$queryRaw`SELECT 1`; } catch { dbStatus = 'offline'; }

    // Verificar uploads
    const storageStatus = fs.existsSync(UPLOADS_DIR) ? 'online' : 'offline';

    // Contar dispositivos por estado
    const [devicesOnline, devicesRecording, devicesUploading] = await Promise.all([
      prisma.device.count({ where: { isOnline: true } }),
      prisma.device.count({ where: { recordingState: 'recording' } }),
      prisma.device.count({ where: { recordingState: 'uploading' } }),
    ]);

    return res.json({
      backend: 'online',
      database: dbStatus,
      ai: 'online',
      storage: storageStatus,
      devicesOnline,
      devicesRecording,
      devicesUploading,
    });
  } catch (error) {
    logger.error('ADMIN SYSTEM', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener estado del sistema.' });
  }
});

// GET /api/admin/devices
router.get('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { lastSeenAt: 'desc' },
      select: {
        deviceId: true,
        name: true,
        firmwareVersion: true,
        ipAddress: true,
        isOnline: true,
        recordingState: true,
        lastSeenAt: true,
      },
    });

    return res.json(devices);
  } catch (error) {
    logger.error('ADMIN DEVICES', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener dispositivos.' });
  }
});

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: 'system' } },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        email: true,
        provider: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { classes: true } },
      },
    });

    const result = users.map((u) => ({
      name: u.name,
      email: u.email,
      provider: u.provider,
      role: u.role,
      createdAt: u.createdAt,
      lastAccess: u.updatedAt,
      classCount: u._count.classes,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('ADMIN USERS', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener usuarios.' });
  }
});

// GET /api/admin/companies
router.get('/companies', async (req: AuthRequest, res: Response) => {
  try {
    const companies = await prisma.user.findMany({
      where: { role: 'company' },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            classes: true,
            devices: true,
          },
        },
      },
    });

    const result = companies.map((c) => ({
      company: c.name,
      email: c.email,
      users: 1,
      classes: c._count.classes,
      devices: c._count.devices,
      createdAt: c.createdAt,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('ADMIN COMPANIES', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener empresas.' });
  }
});

// GET /api/admin/analytics
router.get('/analytics', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const [transcriptions, summaries, topics, todayClasses, weekClasses] = await Promise.all([
      prisma.class.count({ where: { transcript: { not: null } } }),
      prisma.class.count({ where: { summary: { not: null } } }),
      prisma.topic.count(),
      prisma.class.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.class.count({ where: { createdAt: { gte: weekStart } } }),
    ]);

    return res.json({
      transcriptions,
      summaries,
      topics,
      averageProcessingTime: null,
      todayClasses,
      weekClasses,
    });
  } catch (error) {
    logger.error('ADMIN ANALYTICS', 'Error:', error);
    return res.status(500).json({ message: 'Error al obtener analíticas.' });
  }
});

export default router;
