"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/tasks
// Obtiene todas las tareas del usuario logueado (tanto manuales como de IA)
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const tasks = await prisma_1.default.task.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(tasks);
    }
    catch (error) {
        console.error('Error al obtener tareas:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// POST /api/tasks
// Crea una tarea manualmente desde el celular
router.post('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const { title, isUrgent, dueDate } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    if (!title || title.trim() === '') {
        return res.status(400).json({ message: 'El título de la tarea es requerido.' });
    }
    try {
        const newTask = await prisma_1.default.task.create({
            data: {
                title,
                isCompleted: false,
                isUrgent: isUrgent || false,
                dueDate: dueDate || 'Próxima',
                userId
            }
        });
        return res.status(201).json(newTask);
    }
    catch (error) {
        console.error('Error al crear tarea:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// PUT /api/tasks/:id
// Actualiza las propiedades de una tarea (completado, título, urgencia, fecha)
router.put('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const taskId = req.params.id;
    const { title, isCompleted, isUrgent, dueDate } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        // Validar propiedad
        const existingTask = await prisma_1.default.task.findFirst({
            where: { id: taskId, userId }
        });
        if (!existingTask) {
            return res.status(404).json({ message: 'Tarea no encontrada.' });
        }
        const updatedTask = await prisma_1.default.task.update({
            where: { id: taskId },
            data: {
                title: title !== undefined ? title : existingTask.title,
                isCompleted: isCompleted !== undefined ? isCompleted : existingTask.isCompleted,
                isUrgent: isUrgent !== undefined ? isUrgent : existingTask.isUrgent,
                dueDate: dueDate !== undefined ? dueDate : existingTask.dueDate
            }
        });
        return res.json(updatedTask);
    }
    catch (error) {
        console.error('Error al actualizar tarea:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// DELETE /api/tasks/:id
// Elimina una tarea física de la base de datos
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const taskId = req.params.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        // Validar propiedad
        const existingTask = await prisma_1.default.task.findFirst({
            where: { id: taskId, userId }
        });
        if (!existingTask) {
            return res.status(404).json({ message: 'Tarea no encontrada.' });
        }
        await prisma_1.default.task.delete({
            where: { id: taskId }
        });
        return res.json({ message: 'Tarea eliminada con éxito.' });
    }
    catch (error) {
        console.error('Error al eliminar tarea:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
exports.default = router;
