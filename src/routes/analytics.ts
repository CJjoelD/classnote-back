import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/analytics
// Retorna estadísticas académicas del estudiante (tareas resueltas, horas estimadas, etc.)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    // 1. Tareas completadas vs totales
    const totalTasks = await prisma.task.count({ where: { userId } });
    const completedTasks = await prisma.task.count({ where: { userId, isCompleted: true } });
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 2. Total de clases grabadas
    const totalClasses = await prisma.class.count({ where: { userId } });

    // 3. Obtener nombres de materias grabadas para estadísticas de distribución
    const classes = await prisma.class.findMany({
      where: { userId },
      select: { title: true }
    });

    const subjectCounts: Record<string, number> = {};
    classes.forEach((c) => {
      const title = c.title.trim();
      subjectCounts[title] = (subjectCounts[title] || 0) + 1;
    });

    const topSubjects = Object.entries(subjectCounts)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3); // Top 3 materias

    // 4. Recordatorios urgentes pendientes
    const pendingUrgentTasks = await prisma.task.count({
      where: { userId, isCompleted: false, isUrgent: true }
    });

    return res.json({
      metrics: {
        totalTasks,
        completedTasks,
        completionRate,
        totalClasses,
        pendingUrgentTasks,
        topSubjects
      }
    });
  } catch (error) {
    logger.error('ANALYTICS', 'Error al generar analíticas:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

export default router;
