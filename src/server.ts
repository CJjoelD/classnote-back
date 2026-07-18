import * as dotenv from 'dotenv';
// Cargar variables de entorno
dotenv.config();

import app from './app';
import prisma from './config/prisma';

const PORT = process.env.PORT || 5000;

// Asegurar que existe el usuario "system" para dispositivos auto-registrados
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
      console.log('[SYSTEM]: Usuario "system" creado para dispositivos auto-registrados.');
    }
  } catch (error) {
    console.error('[SYSTEM ERROR]:', error);
  }
}

ensureSystemUser();

// Cron job: Marcar dispositivos como inactive después de 90 segundos sin heartbeat
setInterval(async () => {
  try {
    const now = Date.now();
    const threshold = new Date(now - 90_000); // 90 segundos (ESP32 cada 15s)

    // Diagnosticar: mostrar todos los dispositivos activos y su lastSeenAt
    const activeDevices = await prisma.device.findMany({
      where: { status: 'active' },
      select: { id: true, macAddress: true, userId: true, lastSeenAt: true, status: true }
    });

    if (activeDevices.length > 0) {
      for (const d of activeDevices) {
        const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
        const secondsAgo = d.lastSeenAt ? ((now - lastSeenMs) / 1000).toFixed(1) : 'N/A';
        console.log(`[DEVICE CLEANUP DEBUG]: ${d.macAddress} userId=${d.userId} lastSeenAt=${d.lastSeenAt} (${secondsAgo}s ago) threshold=${threshold.toISOString()}`);
      }
    }

    const result = await prisma.device.updateMany({
      where: {
        status: 'active',
        lastSeenAt: { lt: threshold }
      },
      data: { status: 'inactive' }
    });
    if (result.count > 0) {
      console.log(`[DEVICE CLEANUP]: ${result.count} dispositivo(s) marcado(s) como inactivos (sin heartbeat por >90s)`);
    } else if (activeDevices.length > 0) {
      console.log(`[DEVICE CLEANUP]: ${activeDevices.length} dispositivo(s) activo(s) — todos con heartbeat reciente`);
    }
  } catch (error) {
    console.error('[DEVICE CLEANUP ERROR]:', error);
  }
}, 30_000); // Ejecutar cada 30 segundos para mejor diagnóstico

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`=============================================`);
  console.log(`🚀 ClassNote Box backend está corriendo en:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`=============================================`);
});
