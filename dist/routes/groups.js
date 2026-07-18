"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Helper: Generar código de invitación aleatorio de 6 caracteres alfanuméricos
const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};
// POST /api/groups
// Crear un grupo de estudio y unirse automáticamente
router.post('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const { name } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'El nombre del grupo es requerido.' });
    }
    try {
        let inviteCode = generateInviteCode();
        // Asegurar unicidad del código
        let existingCode = await prisma_1.default.studyGroup.findUnique({ where: { inviteCode } });
        while (existingCode) {
            inviteCode = generateInviteCode();
            existingCode = await prisma_1.default.studyGroup.findUnique({ where: { inviteCode } });
        }
        const newGroup = await prisma_1.default.studyGroup.create({
            data: {
                name,
                inviteCode,
                members: {
                    connect: { id: userId }
                }
            },
            include: {
                members: {
                    select: { id: true, name: true }
                }
            }
        });
        return res.status(201).json(newGroup);
    }
    catch (error) {
        console.error('Error al crear grupo de estudio:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// POST /api/groups/join
// Unirse a un grupo usando el código único de invitación
router.post('/join', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const { inviteCode } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    if (!inviteCode) {
        return res.status(400).json({ message: 'El código de invitación es requerido.' });
    }
    try {
        const group = await prisma_1.default.studyGroup.findUnique({
            where: { inviteCode: inviteCode.toUpperCase() },
            include: {
                members: {
                    select: { id: true }
                }
            }
        });
        if (!group) {
            return res.status(404).json({ message: 'Código de invitación inválido. Grupo no encontrado.' });
        }
        // Verificar si ya pertenece al grupo
        const alreadyMember = group.members.some((m) => m.id === userId);
        if (alreadyMember) {
            return res.status(400).json({ message: 'Ya eres miembro de este grupo de estudio.' });
        }
        const updatedGroup = await prisma_1.default.studyGroup.update({
            where: { id: group.id },
            data: {
                members: {
                    connect: { id: userId }
                }
            },
            include: {
                members: {
                    select: { id: true, name: true }
                }
            }
        });
        return res.json({
            message: 'Te has unido exitosamente al grupo de estudio.',
            group: updatedGroup
        });
    }
    catch (error) {
        console.error('Error al unirse al grupo:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// GET /api/groups
// Listar todos los grupos del estudiante logueado
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const groups = await prisma_1.default.studyGroup.findMany({
            where: {
                members: {
                    some: { id: userId }
                }
            },
            include: {
                classes: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        duration: true,
                        date: true,
                        userId: true
                    }
                },
                members: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
        return res.json(groups);
    }
    catch (error) {
        console.error('Error al obtener grupos:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// POST /api/groups/:groupId/share-class
// Compartir una clase grabada con el grupo
router.post('/:groupId/share-class', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const { groupId } = req.params;
    const { classId } = req.body;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    if (!classId) {
        return res.status(400).json({ message: 'El ID de la clase es requerido.' });
    }
    try {
        // Validar pertenencia al grupo
        const group = await prisma_1.default.studyGroup.findFirst({
            where: {
                id: groupId,
                members: { some: { id: userId } }
            }
        });
        if (!group) {
            return res.status(404).json({ message: 'Grupo no encontrado o no eres miembro.' });
        }
        // Validar que la clase pertenece al usuario
        const userClass = await prisma_1.default.class.findFirst({
            where: { id: classId, userId }
        });
        if (!userClass) {
            return res.status(404).json({ message: 'La clase especificada no existe o no te pertenece.' });
        }
        const updatedClass = await prisma_1.default.class.update({
            where: { id: classId },
            data: { studyGroupId: groupId }
        });
        return res.json({
            message: 'Clase compartida exitosamente en el grupo.',
            class: updatedClass
        });
    }
    catch (error) {
        console.error('Error al compartir clase en grupo:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
exports.default = router;
