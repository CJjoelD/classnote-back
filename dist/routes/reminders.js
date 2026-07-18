"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/reminders
// Retorna recordatorios académicos y alertas extraídas de las clases
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const reminders = await prisma_1.default.reminder.findMany({
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
    }
    catch (error) {
        console.error('Error al obtener recordatorios:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
exports.default = router;
