import { Router, Response } from 'express';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/tasks
// Obtiene todas las tareas del usuario logueado (tanto manuales como de IA)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(tasks);
  } catch (error) {
    logger.error('TASKS', 'Error al obtener tareas:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// POST /api/tasks
// Crea una tarea manualmente desde el celular
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const { title, isUrgent, dueDate } = req.body;

  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  if (!title || title.trim() === '') {
    return res.status(400).json({ message: 'El título de la tarea es requerido.' });
  }

  try {
    const newTask = await prisma.task.create({
      data: {
        title,
        isCompleted: false,
        isUrgent: isUrgent || false,
        dueDate: dueDate || 'Próxima',
        userId
      }
    });

    return res.status(201).json(newTask);
  } catch (error) {
    logger.error('TASKS', 'Error al crear tarea:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// PUT /api/tasks/:id
// Actualiza las propiedades de una tarea (completado, título, urgencia, fecha)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const taskId = req.params.id;
  const { title, isCompleted, isUrgent, dueDate } = req.body;

  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    // Validar propiedad
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!existingTask) {
      return res.status(404).json({ message: 'Tarea no encontrada.' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : existingTask.title,
        isCompleted: isCompleted !== undefined ? isCompleted : existingTask.isCompleted,
        isUrgent: isUrgent !== undefined ? isUrgent : existingTask.isUrgent,
        dueDate: dueDate !== undefined ? dueDate : existingTask.dueDate
      }
    });

    return res.json(updatedTask);
  } catch (error) {
    logger.error('TASKS', 'Error al actualizar tarea:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// DELETE /api/tasks/:id
// Elimina una tarea física de la base de datos
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const taskId = req.params.id;

  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    // Validar propiedad
    const existingTask = await prisma.task.findFirst({
      where: { id: taskId, userId }
    });

    if (!existingTask) {
      return res.status(404).json({ message: 'Tarea no encontrada.' });
    }

    await prisma.task.delete({
      where: { id: taskId }
    });

    return res.json({ message: 'Tarea eliminada con éxito.' });
  } catch (error) {
    logger.error('TASKS', 'Error al eliminar tarea:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

export default router;
