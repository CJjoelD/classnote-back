import { Router, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import prisma from '../config/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { transcribeAudio, analyzeTranscript } from '../services/openai';

const router = Router();

// Asegurar que la carpeta de uploads exista localmente
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // Límite de 50MB
});

// Helper: Formatear duración de audio estimada para el registro
const estimateDuration = (bytes: number): string => {
  // Estimación sencilla basada en tasas de bits comunes
  const totalSeconds = Math.ceil(bytes / 32000); 
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes === 0) return `${totalSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}min`;
  }
  return `${minutes}min`;
};

// Función interna: procesa audio real con IA (Groq/Deepgram/Whisper → análisis OpenAI)
async function processClassRecording(
  classId: string,
  filePath: string,
  rawTitle: string,
  userId: string
) {
  try {
    console.log(`[PROCESAMIENTO]: Iniciando transcripción para clase ID: ${classId}`);

    // 1. Transcribir el audio real
    const transcript = await transcribeAudio(filePath, rawTitle);

    console.log(`[PROCESAMIENTO]: Transcripción completada. Generando análisis...`);

    // 2. Analizar la transcripción con IA
    const analysis = await analyzeTranscript(transcript, rawTitle);

    // 3. Guardar todo en BD
    await prisma.$transaction(async (tx) => {
      let subjectId: string | null = null;
      let projectId: string | null = null;

      if (analysis.type === 'Reunión' && analysis.project) {
        let dbProject = await tx.project.findFirst({ where: { name: analysis.project, userId } });
        if (!dbProject) dbProject = await tx.project.create({ data: { name: analysis.project, userId } });
        projectId = dbProject.id;
      } else if (analysis.subject) {
        let dbSubject = await tx.subject.findFirst({ where: { name: analysis.subject, userId } });
        if (!dbSubject) dbSubject = await tx.subject.create({ data: { name: analysis.subject, userId } });
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

    console.log(`[PROCESAMIENTO]: Clase ID ${classId} procesada con éxito.`);
  } catch (procError) {
    console.error(`[PROCESAMIENTO ERROR]: Error al procesar clase ID ${classId}:`, procError);
    await prisma.class.update({
      where: { id: classId },
      data: { status: 'Pendiente' }
    }).catch(() => {});
  }
}

// POST /api/classes/upload
// Sube el archivo y ejecuta el procesamiento con Whisper + GPT de forma síncrona o asíncrona
router.post('/upload', authenticateToken, upload.single('audio'), async (req: AuthRequest, res: Response) => {
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
    const initialClass = await prisma.class.create({
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
  } catch (error) {
    console.error('Error en el endpoint de subida:', error);
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    return res.status(500).json({ message: 'Error interno al subir el audio.' });
  }
});

// POST /api/classes/upload-hardware
// Recibe audio de forma directa de un dispositivo físico ESP32 emparejado por dirección MAC
router.post('/upload-hardware', async (req: any, res: Response) => {
  const rawMac = req.headers['x-device-mac'];

  if (!rawMac || typeof rawMac !== 'string') {
    return res.status(400).json({ message: 'Dirección MAC del hardware no proporcionada en la cabecera X-Device-MAC.' });
  }

  const cleanMac = rawMac.toUpperCase().trim();

  try {
    let device = await prisma.device.findUnique({
      where: { macAddress: cleanMac }
    });

    // Auto-registrar si no existe
    if (!device) {
      // Buscar el usuario real más reciente (no el system)
      const lastRealUser = await prisma.user.findFirst({
        where: { id: { not: 'system' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true }
      });
      const defaultUserId = lastRealUser?.id || 'system';

      device = await prisma.device.create({
        data: {
          macAddress: cleanMac,
          status: 'active',
          name: 'ClassNote Box',
          userId: defaultUserId,
          lastSeenAt: new Date()
        }
      });
      console.log(`[HARDWARE]: ESP32 auto-registrado: ${cleanMac} → usuario ${defaultUserId}`);
    }

    // Actualizar lastSeenAt y reactivar si estaba inactivo
    const updateData: any = { lastSeenAt: new Date() };
    if (device.status === 'inactive') {
      updateData.status = 'active';
    }
    await prisma.device.update({ where: { id: device.id }, data: updateData });

    // Siempre reasignar al usuario real más reciente (no 'system')
    let userId = device.userId;
    if (userId === 'system' || true) {
      const lastRealUser = await prisma.user.findFirst({
        where: { id: { not: 'system' } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true }
      });
      if (lastRealUser && userId !== lastRealUser.id) {
        console.log(`[HARDWARE]: Dispositivo ${cleanMac} reasignado de '${userId}' → '${lastRealUser.id}'`);
        userId = lastRealUser.id;
        await prisma.device.update({ where: { id: device.id }, data: { userId } });
      }
    }

    // Crear un archivo temporal para guardar el audio en disco (raw binary data)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `audio-hardware-${uniqueSuffix}.wav`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const fileStream = fs.createWriteStream(filePath);
    req.pipe(fileStream);

    fileStream.on('error', (err) => {
      console.error('[HARDWARE UPLOAD]: Error writing file stream:', err);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Error de escritura en el servidor.' });
      }
    });

    fileStream.on('finish', async () => {
      // Obtener el tamaño del archivo guardado
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        fs.unlinkSync(filePath);
        if (!res.headersSent) {
          return res.status(400).json({ message: 'No se recibió ningún dato de audio o el archivo está vacío.' });
        }
        return;
      }

      const dateLabel = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const defaultTitle = `Grabación Física IoT (${dateLabel})`;
      const duration = estimateDuration(stats.size);
      const audioUrl = `/uploads/${filename}`;

      try {
        // Crear el registro inicial con estatus "Procesando"
        const initialClass = await prisma.class.create({
          data: {
            title: defaultTitle,
            audioUrl,
            status: 'Procesando',
            duration,
            date: 'Hoy',
            userId
          }
        });

        // Responder exitosamente al hardware
        res.status(202).json({
          message: 'Grabación de hardware recibida. Procesando...',
          class: initialClass
        });

        // Iniciar procesamiento de IA en segundo plano
        processClassRecording(initialClass.id, filePath, defaultTitle, userId);
      } catch (dbError) {
        console.error('[HARDWARE UPLOAD]: Error guardando en base de datos:', dbError);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        if (!res.headersSent) {
          return res.status(500).json({ message: 'Error interno en el servidor.' });
        }
      }
    });
  } catch (error) {
    console.error('Error en el endpoint de subida de hardware:', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// GET /api/classes
// Obtiene el historial de clases del usuario logueado
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const classes = await prisma.class.findMany({
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

      if (diffDays === 0) dateLabel = 'Hoy';
      else if (diffDays === 1) dateLabel = 'Ayer';
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
  } catch (error) {
    console.error('Error al obtener clases:', error);
    return res.status(500).json({ message: 'Error al consultar clases.' });
  }
});

// GET /api/classes/:id
// Obtiene el detalle completo de la clase, incluyendo resumen, tareas, recordatorios, flashcards y exámenes
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const classId = req.params.id;

  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const classDetail = await prisma.class.findFirst({
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
  } catch (error) {
    console.error('Error al obtener detalle de clase:', error);
    return res.status(500).json({ message: 'Error al consultar detalles.' });
  }
});

// DELETE /api/classes/:id
// Elimina una grabacion propia, sus datos relacionados y el audio local si existe.
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const classId = req.params.id;
  if (!userId) return res.status(401).json({ message: 'No autorizado.' });

  try {
    const classToDelete = await prisma.class.findFirst({ where: { id: classId, userId } });
    if (!classToDelete) return res.status(404).json({ message: 'Grabacion no encontrada.' });

    await prisma.class.delete({ where: { id: classId } });
    if (classToDelete.audioUrl?.startsWith('/uploads/')) {
      const audioPath = path.join(UPLOADS_DIR, path.basename(classToDelete.audioUrl));
      fs.unlink(audioPath, () => {});
    }
    return res.json({ message: 'Grabacion eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar grabacion:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la grabacion.' });
  }
});

export default router;
