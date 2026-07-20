"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const prisma_1 = __importDefault(require("../config/prisma"));
const auth_1 = require("../middleware/auth");
const openai_1 = require("../services/openai");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Asegurar que la carpeta de uploads exista localmente
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
// Configuración de Multer
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Límite de 50MB
});
// Helper: Formatear duración de audio estimada para el registro
const estimateDuration = (bytes) => {
    // Estimación sencilla basada en tasas de bits comunes
    const totalSeconds = Math.ceil(bytes / 32000);
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes === 0)
        return `${totalSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${remainingMinutes}min`;
    }
    return `${minutes}min`;
};
// Función interna: procesa audio real con IA (Groq/Deepgram/Whisper → análisis OpenAI)
async function processClassRecording(classId, filePath, rawTitle, userId) {
    try {
        logger_1.logger.info('PROCESAMIENTO', `Iniciando transcripción para clase ID: ${classId}`);
        // 1. Transcribir el audio real
        const transcript = await (0, openai_1.transcribeAudio)(filePath, rawTitle);
        logger_1.logger.info('PROCESAMIENTO', 'Transcripción completada. Generando análisis...');
        // 2. Analizar la transcripción con IA
        const analysis = await (0, openai_1.analyzeTranscript)(transcript, rawTitle);
        // 3. Guardar todo en BD
        await prisma_1.default.$transaction(async (tx) => {
            let subjectId = null;
            let projectId = null;
            if (analysis.type === 'Reunión' && analysis.project) {
                let dbProject = await tx.project.findFirst({ where: { name: analysis.project, userId } });
                if (!dbProject)
                    dbProject = await tx.project.create({ data: { name: analysis.project, userId } });
                projectId = dbProject.id;
            }
            else if (analysis.subject) {
                let dbSubject = await tx.subject.findFirst({ where: { name: analysis.subject, userId } });
                if (!dbSubject)
                    dbSubject = await tx.subject.create({ data: { name: analysis.subject, userId } });
                subjectId = dbSubject.id;
            }
            await tx.class.update({
                where: { id: classId },
                data: {
                    status: 'Listo',
                    title: analysis.title || rawTitle,
                    type: analysis.type || 'Clase',
                    transcript,
                    summary: analysis.summary,
                    meetingMinutes: analysis.meetingMinutes || null,
                    subjectId,
                    projectId,
                }
            });
            if (analysis.tasks?.length > 0) {
                await tx.task.createMany({
                    data: analysis.tasks.map((t) => ({
                        title: t.title,
                        isCompleted: false,
                        isUrgent: t.isUrgent || false,
                        dueDate: t.dueDate || 'Próxima',
                        userId,
                        classId
                    }))
                });
            }
            if (analysis.reminders?.length > 0) {
                await tx.reminder.createMany({
                    data: analysis.reminders.map((r) => ({
                        text: r.text,
                        type: r.type || 'info',
                        userId,
                        classId
                    }))
                });
            }
            if (analysis.topics?.length > 0) {
                await tx.topic.createMany({
                    data: analysis.topics.map((name) => ({ name, classId }))
                });
            }
            if (analysis.exams?.length > 0) {
                await tx.exam.createMany({
                    data: analysis.exams.map((e) => ({ title: e.title, date: e.date, classId }))
                });
            }
            if (analysis.flashcards?.length > 0) {
                await tx.flashcard.createMany({
                    data: analysis.flashcards.map((fc) => ({
                        question: fc.question,
                        answer: fc.answer,
                        classId
                    }))
                });
            }
            if (analysis.ads?.length > 0) {
                await tx.ad.createMany({
                    data: analysis.ads.map((a) => ({ description: a.description, classId }))
                });
            }
        });
        logger_1.logger.info('PROCESAMIENTO', `Clase ID ${classId} procesada con éxito.`);
    }
    catch (procError) {
        logger_1.logger.error('PROCESAMIENTO', `Error al procesar clase ID ${classId}`, procError);
        await prisma_1.default.class.update({
            where: { id: classId },
            data: { status: 'Pendiente' }
        }).catch(() => { });
    }
}
// POST /api/classes/upload
// Sube el archivo y ejecuta el procesamiento con Whisper + GPT de forma síncrona o asíncrona
router.post('/upload', auth_1.authenticateToken, upload.single('audio'), async (req, res) => {
    const file = req.file;
    const { title } = req.body;
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ message: 'Usuario no autenticado.' });
    }
    if (!file) {
        return res.status(400).json({ message: 'No se recibió ningún archivo de audio.' });
    }
    if (!title || title.trim() === '') {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: 'El título de la clase es requerido.' });
    }
    try {
        const duration = estimateDuration(file.size);
        const audioUrl = `/uploads/${file.filename}`;
        // Crear el registro inicial con estatus "Procesando"
        const initialClass = await prisma_1.default.class.create({
            data: {
                title,
                audioUrl,
                status: 'Procesando',
                duration,
                date: 'Hoy',
                userId
            }
        });
        // Responder inmediatamente al cliente (Procesando) para evitar timeouts en conexiones
        res.status(202).json({
            message: 'Grabación recibida. La IA está procesando el archivo.',
            class: initialClass
        });
        // Iniciar procesamiento asíncrono en segundo plano
        processClassRecording(initialClass.id, file.path, title, userId);
    }
    catch (error) {
        logger_1.logger.error('UPLOAD', 'Error en el endpoint de subida', error);
        if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        return res.status(500).json({ message: 'Error interno al subir el audio.' });
    }
});
// POST /api/classes/upload-hardware
// Recibe audio raw (binary) del ESP32.
// Identificacion por X-Device-Id o X-Device-MAC (fallback).
// Responde 202 inmediatamente y procesa en background.
router.post('/upload-hardware', async (req, res) => {
    const startTime = Date.now();
    const rawDeviceId = req.headers['x-device-id'];
    const rawMac = req.headers['x-device-mac'];
    const deviceIp = req.ip || req.socket.remoteAddress || 'unknown';
    logger_1.logger.info('UPLOAD-HW', '=== NUEVA PETICIÓN ===');
    logger_1.logger.info('UPLOAD-HW', `IP dispositivo: ${deviceIp}`);
    logger_1.logger.info('UPLOAD-HW', `Headers recibidos: ${JSON.stringify({
        'x-device-id': rawDeviceId || '(no presente)',
        'x-device-mac': rawMac || '(no presente)',
        'content-type': req.headers['content-type'] || '(no presente)',
        'content-length': req.headers['content-length'] || '(no presente)',
    })}`);
    // Identificar deviceId: priorizar X-Device-Id, fallback a X-Device-MAC
    const resolvedDeviceId = rawDeviceId || rawMac;
    if (!resolvedDeviceId || typeof resolvedDeviceId !== 'string') {
        logger_1.logger.info('UPLOAD-HW', 'RECHAZADO 400: Ningún header de identificación proporcionado');
        return res.status(400).json({ message: 'X-Device-Id header es requerido.' });
    }
    logger_1.logger.info('UPLOAD-HW', `DeviceId resuelto: ${resolvedDeviceId}`);
    try {
        // Buscar dispositivo por deviceId
        let device = await prisma_1.default.device.findFirst({
            where: { deviceId: resolvedDeviceId }
        });
        if (!device) {
            logger_1.logger.info('UPLOAD-HW', `Dispositivo ${resolvedDeviceId} no encontrado, auto-registrando...`);
            const lastRealUser = await prisma_1.default.user.findFirst({
                where: { id: { not: 'system' } },
                orderBy: { updatedAt: 'desc' },
                select: { id: true }
            });
            const defaultUserId = lastRealUser?.id || 'system';
            device = await prisma_1.default.device.create({
                data: {
                    deviceId: resolvedDeviceId,
                    macAddress: rawMac || undefined,
                    status: 'active',
                    name: 'ClassNote Box',
                    userId: defaultUserId,
                    lastSeenAt: new Date(),
                    isOnline: true
                }
            });
            logger_1.logger.info('UPLOAD-HW', `Dispositivo auto-registrado: ${resolvedDeviceId} → usuario ${defaultUserId}`);
        }
        // Actualizar lastSeenAt e isOnline
        const updateData = { lastSeenAt: new Date(), isOnline: true };
        if (device.status === 'inactive') {
            updateData.status = 'active';
        }
        await prisma_1.default.device.update({ where: { id: device.id }, data: updateData });
        // Reasignar al usuario real mas reciente
        let userId = device.userId;
        const lastRealUser = await prisma_1.default.user.findFirst({
            where: { id: { not: 'system' } },
            orderBy: { updatedAt: 'desc' },
            select: { id: true }
        });
        if (lastRealUser && userId !== lastRealUser.id) {
            logger_1.logger.info('UPLOAD-HW', `Reasignado '${userId}' → '${lastRealUser.id}'`);
            userId = lastRealUser.id;
            await prisma_1.default.device.update({ where: { id: device.id }, data: { userId } });
        }
        // Recibir body raw en buffer
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        logger_1.logger.info('UPLOAD-HW', `Audio recibido: ${audioBuffer.length} bytes de ${resolvedDeviceId}`);
        if (audioBuffer.length === 0) {
            logger_1.logger.info('UPLOAD-HW', 'RECHAZADO 400: Body vacío');
            return res.status(400).json({ message: 'No se recibió ningún dato de audio.' });
        }
        // Crear clase
        const dateLabel = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const defaultTitle = `Grabación Física IoT (${dateLabel})`;
        const duration = estimateDuration(audioBuffer.length);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const filename = `audio-hardware-${uniqueSuffix}.wav`;
        const audioUrl = `/uploads/${filename}`;
        const initialClass = await prisma_1.default.class.create({
            data: {
                title: defaultTitle,
                audioUrl,
                status: 'Procesando',
                duration,
                date: 'Hoy',
                userId
            }
        });
        const elapsed = Date.now() - startTime;
        logger_1.logger.info('UPLOAD-HW', `Clase ${initialClass.id} creada (${duration}, ${audioBuffer.length} bytes)`);
        logger_1.logger.info('UPLOAD-HW', `Respondiendo 202 (${elapsed}ms total)`);
        // Responder 202 inmediatamente
        res.status(202).json({
            message: 'Grabación de hardware recibida. Procesando...',
            class: initialClass
        });
        // Guardar archivo en disco en background
        const filePath = path.join(UPLOADS_DIR, filename);
        fs.writeFile(filePath, audioBuffer, (writeErr) => {
            if (writeErr) {
                logger_1.logger.error('UPLOAD-HW', `Error escribiendo archivo ${filename}`, writeErr);
                return;
            }
            logger_1.logger.info('UPLOAD-HW', `Archivo ${filename} guardado en disco`);
            logger_1.logger.info('UPLOAD-HW', `Iniciando procesamiento IA para clase ${initialClass.id}`);
            // Iniciar procesamiento de IA en background
            processClassRecording(initialClass.id, filePath, defaultTitle, userId);
        });
    }
    catch (error) {
        const elapsed = Date.now() - startTime;
        logger_1.logger.error('UPLOAD-HW', `ERROR para ${resolvedDeviceId} (${elapsed}ms)`, error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// GET /api/classes
// Obtiene el historial de clases del usuario logueado
router.get('/', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const classes = await prisma_1.default.class.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                status: true,
                duration: true,
                date: true,
                type: true,
                createdAt: true,
                subject: { select: { name: true } },
                project: { select: { name: true } }
            }
        });
        // Formatear campo de fecha descriptiva basada en antigüedad
        const formattedClasses = classes.map((c) => {
            const diffMs = Date.now() - new Date(c.createdAt).getTime();
            const diffDays = Math.floor(diffMs / 86400000);
            let dateLabel = c.date;
            if (diffDays === 0)
                dateLabel = 'Hoy';
            else if (diffDays === 1)
                dateLabel = 'Ayer';
            else if (diffDays < 7) {
                const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                const dayName = days[new Date(c.createdAt).getDay()];
                dateLabel = `${dayName}`;
            }
            return {
                ...c,
                date: dateLabel
            };
        });
        return res.json(formattedClasses);
    }
    catch (error) {
        logger_1.logger.error('CLASES', 'Error al obtener clases', error);
        return res.status(500).json({ message: 'Error al consultar clases.' });
    }
});
// GET /api/classes/:id
// Obtiene el detalle completo de la clase, incluyendo resumen, tareas, recordatorios, flashcards y exámenes
router.get('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const classId = req.params.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const classDetail = await prisma_1.default.class.findFirst({
            where: { id: classId, userId },
            include: {
                tasks: true,
                reminders: true,
                topics: true,
                exams: true,
                flashcards: true,
                ads: true,
                subject: true,
                project: true
            }
        });
        if (!classDetail) {
            return res.status(404).json({ message: 'Grabación no encontrada.' });
        }
        return res.json(classDetail);
    }
    catch (error) {
        logger_1.logger.error('CLASES', 'Error al obtener detalle de clase', error);
        return res.status(500).json({ message: 'Error al consultar detalles.' });
    }
});
// DELETE /api/classes/:id
// Elimina una grabacion propia, sus datos relacionados y el audio local si existe.
router.delete('/:id', auth_1.authenticateToken, async (req, res) => {
    const userId = req.user?.id;
    const classId = req.params.id;
    if (!userId)
        return res.status(401).json({ message: 'No autorizado.' });
    try {
        const classToDelete = await prisma_1.default.class.findFirst({ where: { id: classId, userId } });
        if (!classToDelete)
            return res.status(404).json({ message: 'Grabacion no encontrada.' });
        await prisma_1.default.class.delete({ where: { id: classId } });
        if (classToDelete.audioUrl?.startsWith('/uploads/')) {
            const audioPath = path.join(UPLOADS_DIR, path.basename(classToDelete.audioUrl));
            fs.unlink(audioPath, () => { });
        }
        return res.json({ message: 'Grabacion eliminada correctamente.' });
    }
    catch (error) {
        logger_1.logger.error('CLASES', 'Error al eliminar grabacion', error);
        return res.status(500).json({ message: 'No se pudo eliminar la grabacion.' });
    }
});
exports.default = router;
