"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/analytics
// Retorna estadísticas académicas del estudiante (tareas resueltas, horas estimadas, etc.)
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        // 1. Tareas completadas vs totales
        const totalTasks = await prisma_1.default.task.count({ where: { userId } });
        const completedTasks = await prisma_1.default.task.count({ where: { userId, isCompleted: true } });
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        // 2. Total de clases grabadas
        const totalClasses = await prisma_1.default.class.count({ where: { userId } });
        // 3. Obtener nombres de materias grabadas para estadísticas de distribución
        const classes = await prisma_1.default.class.findMany({
            where: { userId },
            select: { title: true }
        });
        const subjectCounts = {};
        classes.forEach((c) => {
            const title = c.title.trim();
            subjectCounts[title] = (subjectCounts[title] || 0) + 1;
        });
        const topSubjects = Object.entries(subjectCounts)
            .map(([subject, count]) => ({ subject, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3); // Top 3 materias
        // 4. Recordatorios urgentes pendientes
        const pendingUrgentTasks = await prisma_1.default.task.count({
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
    }
    catch (error) {
        console.error('Error al generar analíticas:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
exports.default = router;
