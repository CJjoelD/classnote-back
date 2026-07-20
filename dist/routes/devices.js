"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// GET /api/devices
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const devices = await prisma_1.default.device.findMany({
            where: {
                OR: [
                    { userId },
                    { userId: 'system' }
                ]
            },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                deviceId: true,
                name: true,
                isOnline: true,
                recordingState: true,
                lastSeenAt: true,
                status: true
            }
        });
        return res.json(devices);
    }
    catch (error) {
        logger_1.logger.error('GET DEVICES', 'Error:', error);
        return res.status(500).json({ message: 'No se pudieron consultar los dispositivos.' });
    }
});
// POST /api/devices/:deviceId/start-recording
// Reservado para futuras funciones remotas. No usar normalmente.
router.post('/:deviceId/start-recording', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    const { deviceId } = req.params;
    try {
        const device = await prisma_1.default.device.findUnique({ where: { deviceId } });
        if (!device) {
            return res.status(404).json({ message: 'Dispositivo no encontrado.' });
        }
        await prisma_1.default.device.update({
            where: { deviceId },
            data: { pendingCommand: 'startRecording' }
        });
        logger_1.logger.info('REMOTE', `Comando startRecording → ${deviceId}`);
        return res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('REMOTE', `Error start-recording ${req.params.deviceId}:`, error);
        return res.status(500).json({ message: 'Error interno.' });
    }
});
// POST /api/devices/:deviceId/stop-recording
// Reservado para futuras funciones remotas. No usar normalmente.
router.post('/:deviceId/stop-recording', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    const { deviceId } = req.params;
    try {
        const device = await prisma_1.default.device.findUnique({ where: { deviceId } });
        if (!device) {
            return res.status(404).json({ message: 'Dispositivo no encontrado.' });
        }
        await prisma_1.default.device.update({
            where: { deviceId },
            data: { pendingCommand: 'stopRecording' }
        });
        logger_1.logger.info('REMOTE', `Comando stopRecording → ${deviceId}`);
        return res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('REMOTE', `Error stop-recording ${req.params.deviceId}:`, error);
        return res.status(500).json({ message: 'Error interno.' });
    }
});
// POST /api/devices/heartbeat
// El ESP32 es quien controla la grabacion. El backend solo coordina.
// Objetivo: respuesta en <50ms. Minimo de queries.
router.post('/heartbeat', async (req, res) => {
    const { deviceId, macAddress, ipAddress, firmwareVersion, recordingState } = req.body;
    const deviceIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!deviceId || typeof deviceId !== 'string') {
        logger_1.logger.info('HEARTBEAT', `RECHAZADO 400: deviceId no proporcionado (IP: ${deviceIp})`);
        return res.status(400).json({ message: 'deviceId es requerido.' });
    }
    // Mapear estados del ESP32 a recordingState del backend
    let mappedState = null;
    if (recordingState) {
        const state = recordingState.toUpperCase();
        if (state === 'READY' || state === 'IDLE' || state === 'FINISHED') {
            mappedState = 'idle';
        }
        else if (state === 'RECORDING') {
            mappedState = 'recording';
        }
        else if (state === 'UPLOADING') {
            mappedState = 'uploading';
        }
        else if (state === 'PROCESSING') {
            mappedState = 'processing';
        }
        else {
            mappedState = recordingState.toLowerCase();
        }
    }
    const now = new Date();
    logger_1.logger.info('HEARTBEAT', `${deviceId} | estado=${recordingState || 'N/A'} → ${mappedState || 'N/A'} | IP=${ipAddress || deviceIp}`);
    try {
        const existing = await prisma_1.default.device.findUnique({
            where: { deviceId },
            select: { id: true, userId: true, pendingCommand: true }
        });
        let device;
        if (existing) {
            device = await prisma_1.default.device.update({
                where: { deviceId },
                data: {
                    macAddress: macAddress || undefined,
                    ipAddress: ipAddress || undefined,
                    firmwareVersion: firmwareVersion || undefined,
                    recordingState: mappedState || undefined,
                    status: 'active',
                    isOnline: true,
                    lastSeenAt: now,
                },
                select: { id: true, name: true, pendingCommand: true }
            });
        }
        else {
            logger_1.logger.info('HEARTBEAT', `Nuevo dispositivo: ${deviceId}`);
            const realUser = await prisma_1.default.user.findFirst({
                where: { id: { not: 'system' } },
                orderBy: { updatedAt: 'desc' },
                select: { id: true }
            });
            device = await prisma_1.default.device.create({
                data: {
                    deviceId,
                    macAddress: macAddress || undefined,
                    ipAddress: ipAddress || undefined,
                    firmwareVersion: firmwareVersion || undefined,
                    recordingState: mappedState || undefined,
                    name: 'ClassNote Box',
                    status: 'active',
                    isOnline: true,
                    lastSeenAt: now,
                    userId: realUser?.id || 'system'
                },
                select: { id: true, name: true, pendingCommand: true }
            });
        }
        const command = device.pendingCommand || null;
        if (command) {
            logger_1.logger.info('HEARTBEAT', `Comando pendiente para ${deviceId}: ${command}`);
            prisma_1.default.device.update({
                where: { deviceId },
                data: { pendingCommand: null }
            }).catch(() => { });
        }
        return res.json({
            success: true,
            serverTime: now.toISOString(),
            command,
        });
    }
    catch (error) {
        logger_1.logger.error('HEARTBEAT', `ERROR ${deviceId}:`, error);
        return res.status(500).json({ message: 'Error interno.' });
    }
});
exports.default = router;
