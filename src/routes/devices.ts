import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
const normalizeMac = (macAddress: string) => macAddress.trim().toUpperCase().replace(/-/g, ':');

// GET /api/devices
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const devices = await prisma.device.findMany({
      where: {
        OR: [
          { userId },
          { userId: 'system' }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, macAddress: true, name: true, status: true, lastSeenAt: true, createdAt: true, userId: true }
    });

    return res.json(devices);
  } catch (error) {
    console.error('Error al consultar dispositivos:', error);
    return res.status(500).json({ message: 'No se pudieron consultar los dispositivos.' });
  }
});

// POST /api/devices/heartbeat
// El ESP32 se registra automaticamente y se asigna al usuario mas reciente.
router.post('/heartbeat', async (req, res: Response) => {
  const rawMac = req.headers['x-device-mac'];
  if (!rawMac || typeof rawMac !== 'string' || !macPattern.test(rawMac)) {
    return res.status(400).json({ message: 'Cabecera X-Device-MAC invalida.' });
  }

  try {
    const cleanMac = normalizeMac(rawMac);
    let device = await prisma.device.findUnique({ where: { macAddress: cleanMac } });

    // Buscar el usuario real mas reciente (nunca 'system')
    const realUser = await prisma.user.findFirst({
      where: { id: { not: 'system' } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true }
    });
    const targetUserId = realUser?.id || 'system';

    const now = new Date();

    if (!device) {
      device = await prisma.device.create({
        data: {
          macAddress: cleanMac,
          status: 'active',
          name: 'ClassNote Box',
          userId: targetUserId,
          lastSeenAt: now
        }
      });
      console.log(`[HEARTBEAT]: ESP32 auto-registrado: ${cleanMac} → usuario ${targetUserId}`);
    } else {
      // Siempre reasignar al usuario real más reciente (no 'system')
      if (targetUserId !== 'system' && device.userId !== targetUserId) {
        console.log(`[HEARTBEAT]: Dispositivo ${cleanMac} reasignado de '${device.userId}' → '${targetUserId}'`);
        await prisma.device.update({ where: { id: device.id }, data: { userId: targetUserId } });
        device.userId = targetUserId;
      }
      // Actualizar lastSeenAt y reactivar si estaba inactivo
      const updateData: any = { lastSeenAt: now };
      if (device.status === 'inactive') {
        updateData.status = 'active';
        console.log(`[HEARTBEAT]: Dispositivo ${cleanMac} reactivado (estaba inactivo)`);
      }
      await prisma.device.update({ where: { id: device.id }, data: updateData });
      console.log(`[HEARTBEAT]: ${cleanMac} lastSeenAt actualizado a ${now.toISOString()}`);
    }

    return res.json({
      message: 'OK',
      serverTime: now.toISOString(),
      status: 'active',
      deviceName: device.name,
    });
  } catch (error) {
    console.error('Error en heartbeat:', error);
    return res.status(500).json({ message: 'Error interno.' });
  }
});

export default router;
