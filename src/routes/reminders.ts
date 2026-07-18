import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/reminders
// Retorna recordatorios académicos y alertas extraídas de las clases
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const reminders = await prisma.reminder.findMany({
      where: { userId },
      include: {
        class: {
          select: {
            title: true,
            date: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(reminders);
  } catch (error) {
    console.error('Error al obtener recordatorios:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

export default router;
