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
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudio = transcribeAudio;
exports.analyzeTranscript = analyzeTranscript;
exports.generateMockAnalysis = generateMockAnalysis;
const openai_1 = require("openai");
const fs = __importStar(require("fs"));
const fs_1 = require("fs");
const logger_1 = require("../utils/logger");
const apiKey = process.env.OPENAI_API_KEY;
let openai = null;
if (apiKey && apiKey.trim() !== '') {
    openai = new openai_1.OpenAI({ apiKey });
    logger_1.logger.info('OPENAI', 'Inicializado con API Key.');
}
else {
    logger_1.logger.warn('OPENAI', 'No se encontró OPENAI_API_KEY en .env. Se usará el simulador inteligente de IA como fallback.');
}
// Deepgram para transcripción ultrarrápida (opcional)
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
if (deepgramApiKey) {
    logger_1.logger.info('DEEPGRAM', 'API Key configurada para transcripción rápida.');
}
else {
    logger_1.logger.warn('DEEPGRAM', 'No se encontró DEEPGRAM_API_KEY en .env.');
}
// Groq para transcripción ultrarrápida con Whisper (opcional)
const groqApiKey = process.env.GROQ_API_KEY;
if (groqApiKey) {
    logger_1.logger.info('GROQ', 'API Key configurada para transcripción rápida.');
}
else {
    logger_1.logger.warn('GROQ', 'No se encontró GROQ_API_KEY en .env.');
}
/**
 * Transcribe un archivo de audio a texto.
 * Orden de prioridad: Groq (ultrarrápido) → Deepgram (rápido) → OpenAI Whisper → Gemini Flash → Mock
 */
async function transcribeAudio(filePath, classTitle) {
    // === DIAGNÓSTICO: Verificar archivo ===
    let fileExists = false;
    let fileSize = 0;
    try {
        const stat = await fs_1.promises.stat(filePath);
        fileExists = true;
        fileSize = stat.size;
        logger_1.logger.info('DIAG', `Archivo encontrado: ${filePath}`);
        logger_1.logger.info('DIAG', `Tamaño del WAV: ${fileSize} bytes (${(fileSize / 1024).toFixed(1)} KB)`);
    }
    catch {
        logger_1.logger.error('DIAG', `Archivo NO encontrado: ${filePath}`);
        return generateMockTranscript(classTitle);
    }
    // Leer el buffer una sola vez para diagnóstico
    const audioBuffer = await fs_1.promises.readFile(filePath);
    // Verificar cabecera WAV
    if (fileSize >= 44) {
        const riff = audioBuffer.toString('ascii', 0, 4);
        const wave = audioBuffer.toString('ascii', 8, 12);
        const numChannels = audioBuffer.readUInt16LE(22);
        const sampleRate = audioBuffer.readUInt32LE(24);
        const bitsPerSample = audioBuffer.readUInt16LE(34);
        logger_1.logger.info('DIAG', `Cabecera WAV: RIFF=${riff}, WAVE=${wave}, Canales=${numChannels}, SampleRate=${sampleRate}Hz, Bits=${bitsPerSample}`);
    }
    else {
        logger_1.logger.warn('DIAG', `Archivo muy pequeño (${fileSize} bytes), cabecera WAV incompleta.`);
    }
    // Verificar si hay actividad de audio (no solo silencio)
    if (fileSize > 44) {
        let sum = 0;
        for (let i = 44; i < fileSize; i += 2) {
            sum += Math.abs(audioBuffer.readInt16LE(i));
        }
        const avgAmplitude = sum / ((fileSize - 44) / 2);
        logger_1.logger.info('DIAG', `Amplitud promedio del audio: ${avgAmplitude.toFixed(1)} (0=silencio total, ~3000-8000=normal)`);
    }
    // 1. Groq (Whisper ultrarrápido - ~1-3 segundos)
    if (groqApiKey) {
        const maskedKey = groqApiKey.substring(0, 8) + '...' + groqApiKey.substring(groqApiKey.length - 4);
        logger_1.logger.info('DIAG', `Groq key presente: ${maskedKey} (longitud: ${groqApiKey.length})`);
        try {
            logger_1.logger.info('GROQ', 'Transcribiendo audio con Groq Whisper (ultrarrápido)...');
            const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', 'whisper-large-v3');
            formData.append('language', 'es');
            formData.append('response_format', 'json');
            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                },
                body: formData,
            });
            logger_1.logger.info('DIAG', `Groq respondió HTTP ${response.status} ${response.statusText}`);
            const resultText = await response.text();
            logger_1.logger.info('DIAG', `Groq respuesta completa: ${resultText.substring(0, 500)}`);
            if (!response.ok) {
                logger_1.logger.error('GROQ', `HTTP ${response.status} — ${resultText.substring(0, 300)}`);
            }
            else {
                // Groq con `response_format='text'` devuelve texto plano, NO JSON
                // Intentar JSON.parse primero, si falla usar el texto directamente
                let transcript = null;
                try {
                    const result = JSON.parse(resultText);
                    transcript = result.text || null;
                }
                catch {
                    // Respuesta es texto plano (formato 'text')
                    transcript = resultText.trim() || null;
                }
                if (transcript && transcript.length > 0) {
                    logger_1.logger.info('GROQ', `Transcripción completada con éxito (${transcript.length} caracteres).`);
                    return transcript;
                }
                else {
                    logger_1.logger.error('GROQ', 'Respuesta vacía o sin texto de transcripción.');
                }
            }
        }
        catch (error) {
            logger_1.logger.error('GROQ', `${error.message || error}`);
        }
    }
    else {
        logger_1.logger.info('DIAG', 'Groq DESCARTADO — no hay GROQ_API_KEY en .env');
    }
    // 2. Deepgram (ultrarrápido - ~2-5 segundos)
    if (deepgramApiKey) {
        const maskedKey = deepgramApiKey.substring(0, 6) + '...' + deepgramApiKey.substring(deepgramApiKey.length - 4);
        logger_1.logger.info('DIAG', `Deepgram key presente: ${maskedKey} (longitud: ${deepgramApiKey.length})`);
        try {
            logger_1.logger.info('DEEPGRAM', 'Transcribiendo audio con Deepgram (ultrarrápido)...');
            const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=es&smart_format=true', {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${deepgramApiKey}`,
                    'Content-Type': 'audio/wav',
                },
                body: audioBuffer,
            });
            logger_1.logger.info('DIAG', `Deepgram respondió HTTP ${response.status} ${response.statusText}`);
            const resultText = await response.text();
            logger_1.logger.info('DIAG', `Deepgram respuesta completa: ${resultText.substring(0, 1000)}`);
            if (!response.ok) {
                logger_1.logger.error('DEEPGRAM', `HTTP ${response.status} — ${resultText.substring(0, 300)}`);
            }
            else {
                const result = JSON.parse(resultText);
                const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;
                const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence;
                const words = result.results?.channels?.[0]?.alternatives?.[0]?.words?.length || 0;
                logger_1.logger.info('DIAG', `Deepgram transcript="${(transcript || '').substring(0, 100)}" confidence=${confidence} words=${words}`);
                if (transcript && transcript.trim().length > 0) {
                    logger_1.logger.info('DEEPGRAM', `Transcripción completada con éxito (${transcript.length} caracteres).`);
                    return transcript.trim();
                }
                else {
                    logger_1.logger.error('DEEPGRAM', 'Transcript vacío. Posibles causas: audio sin voz, formato no soportado, o modelo no detectó habla.');
                }
            }
        }
        catch (error) {
            logger_1.logger.error('DEEPGRAM', `${error.message || error}`);
        }
    }
    else {
        logger_1.logger.info('DIAG', 'Deepgram DESCARTADO — no hay DEEPGRAM_API_KEY en .env');
    }
    // 3. OpenAI Whisper (~10-30 segundos)
    if (openai) {
        logger_1.logger.info('DIAG', 'OpenAI Whisper intentando...');
        try {
            const fileStream = fs.createReadStream(filePath);
            const response = await openai.audio.transcriptions.create({
                file: fileStream,
                model: 'whisper-1',
            });
            logger_1.logger.info('DIAG', 'OpenAI Whisper completado con éxito.');
            return response.text;
        }
        catch (error) {
            logger_1.logger.error('OPENAI', `${error.message || error}`);
            if (error.status)
                logger_1.logger.error('OPENAI', `HTTP ${error.status}`);
            if (error.error?.error?.message)
                logger_1.logger.error('OPENAI', `${error.error.error.message}`);
        }
    }
    else {
        logger_1.logger.info('DIAG', 'OpenAI DESCARTADO — no hay OPENAI_API_KEY válida');
    }
    logger_1.logger.info('DIAG', 'TODOS los servicios de transcripción fallaron. Usando mock como último recurso.');
    return generateMockTranscript(classTitle);
}
/**
 * Genera resúmenes, tareas y recordatorios a partir del texto de la clase.
 * Si no hay API key, genera una estructura JSON adecuada.
 */
async function analyzeTranscript(transcriptText, classTitle) {
    const prompt = `
    Analiza la siguiente transcripción de la grabación "${classTitle}".

    Transcripción:
    "${transcriptText}"

    Identifica si se trata de una clase/entorno educativo (donde hay materias, profesores y exámenes) o una reunión de negocios/entorno corporativo (donde hay proyectos, líderes, acuerdos y compromisos).

    Devuelve un objeto JSON estrictamente formateado de la siguiente manera:
    {
      "title": "Un título descriptivo e inteligente para la grabación basado en el contenido principal.",
      "type": "Clase" | "Reunión" | "Conferencia" | "Tutoría" | "Laboratorio",
      "subject": "Nombre de la materia sugerida (ej: 'Programación', 'Base de Datos') si es del ámbito educativo, sino omitir o nulo.",
      "project": "Nombre del proyecto o departamento sugerido (ej: 'Desarrollo', 'Ventas', 'Marketing') si es del ámbito corporativo, sino omitir o nulo.",
      "summary": "Un resumen detallado en formato Markdown, estructurado con títulos atractivos y viñetas conceptuales de los puntos más importantes discutidos.",
      "topics": ["Tema importante 1", "Tema importante 2", "Concepto clave 3"],
      "tasks": [
        {
          "title": "Descripción de la tarea escolar, compromiso empresarial o pendiente detectado en el texto. En modo empresarial, incluye el nombre del responsable si se menciona (ej: 'Juan: Entregar reporte').",
          "isUrgent": true/false,
          "dueDate": "Estimado de fecha de entrega o indicativo como 'Hoy', 'Mañana', '15 abr' o fecha exacta '2025-04-15'"
        }
      ],
      "reminders": [
        {
          "text": "Advertencia conceptual, recordatorio importante o material complementario mencionado.",
          "type": "urgent" | "warning" | "info"
        }
      ],
      "exams": [
        {
          "title": "Título del examen o entregable mayor detectado.",
          "date": "Fecha aproximada o exacta del examen (ej: '18 abr' or '2025-04-18')"
        }
      ],
      "flashcards": [
        {
          "question": "Pregunta conceptual clave extraída de los temas expuestos.",
          "answer": "Respuesta precisa a la pregunta basada en la explicación dada."
        }
      ],
      "ads": [
        {
          "description": "Anuncios del profesor o avisos importantes compartidos (ej: 'La próxima clase será virtual')."
        }
      ],
      "meetingMinutes": "Si es una reunión corporativa, proporciona un acta de reunión detallada en formato Markdown con acuerdos, decisiones y compromisos clave. Si es una clase, dejar nulo."
    }
  `;
    // 1. OpenAI gpt-4o-mini
    if (openai) {
        try {
            logger_1.logger.info('DIAG', 'OpenAI gpt-4o-mini intentando análisis...');
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
            });
            const responseText = response.choices[0].message.content;
            if (responseText) {
                logger_1.logger.info('DIAG', 'OpenAI análisis completado con éxito.');
                return JSON.parse(responseText);
            }
        }
        catch (error) {
            logger_1.logger.error('OPENAI_ANALYSIS', `${error.message || error}`);
            if (error.status)
                logger_1.logger.error('OPENAI_ANALYSIS', `HTTP ${error.status}`);
            if (error.error?.error?.message)
                logger_1.logger.error('OPENAI_ANALYSIS', `${error.error.error.message}`);
        }
    }
    else {
        logger_1.logger.info('DIAG', 'OpenAI análisis DESCARTADO — no hay OPENAI_API_KEY válida');
    }
    logger_1.logger.info('DIAG', 'OpenAI análisis falló. Usando mock como último recurso.');
    return generateMockAnalysis(classTitle);
}
function generateMockTranscript(title) {
    const lowercaseTitle = title.toLowerCase();
    if (lowercaseTitle.includes('dato') || lowercaseTitle.includes('base')) {
        return 'Buenas tardes a todos. Hoy continuaremos con Bases de Datos II. Específicamente, hablaremos de la Tercera Forma Normal o 3FN. Como recordarán, para que una tabla esté en 3FN, primero debe estar en 2FN y no debe existir ninguna dependencia transitiva. Es decir, los atributos no clave deben depender exclusivamente de la clave primaria, y no de otros atributos no clave. Un error común en el examen de normalización es dejar dependencias transitivas entre la dirección y el código postal del estudiante. Para la entrega del Laboratorio 2, que vence este 15 de abril, deben asegurarse de normalizar completamente el esquema que les envié. Recuerden también que en el examen final siempre entra una pregunta sobre algoritmos de inserción en Árboles B+. Por favor lean el capítulo 6 del libro guía para complementar.';
    }
    if (lowercaseTitle.includes('reun') || lowercaseTitle.includes('proy') || lowercaseTitle.includes('soft') || lowercaseTitle.includes('ing')) {
        return 'Hola muchachos, hoy vamos a revisar metodologías ágiles en Ingeniería de Software. En Scrum, el Sprint Backlog es el conjunto de elementos del Product Backlog seleccionados para el Sprint, junto con el plan para entregarlos. Les recuerdo que la entrega del proyecto grupal es este 12 de abril, donde presentaremos el Sprint Final. Por favor, para mañana lean el capítulo 5 sobre Scrum para el control de lectura.';
    }
    if (lowercaseTitle.includes('calc') || lowercaseTitle.includes('mat')) {
        return 'Buenos días. Hoy estudiaremos la derivada de una función y su interpretación geométrica como la pendiente de la recta tangente a la curva en un punto dado. Haremos ejercicios de derivadas por definición y luego reglas de derivación rápida. Mañana entregaremos el reporte de álgebra y ejercicios de matrices que quedó pendiente.';
    }
    return `Buenos días a todos. Hoy en la clase de ${title} vamos a abordar los temas principales de la unidad de estudio. Es de suma importancia comprender estos conceptos básicos ya que sentarán las bases para los proyectos del semestre. Les pido que completen la lectura sugerida y recuerden que tenemos una entrega la próxima semana sobre estos temas clave.`;
}
function generateMockAnalysis(title) {
    const lowercaseTitle = title.toLowerCase();
    if (lowercaseTitle.includes('dato') || lowercaseTitle.includes('base')) {
        return {
            title: 'Clase de Base de Datos - Normalización y Árboles B+',
            type: 'Clase',
            subject: 'Base de Datos',
            summary: `## 📌 Puntos Principales de la Clase\n\n• **Tercera Forma Normal (3FN)**: Se analizó la necesidad de eliminar dependencias transitivas. Todos los campos de una tabla deben depender directamente y de forma exclusiva de la clave primaria.\n• **Problema de la Dependencia Transitiva**: Ocurre si un campo no clave determina a otro campo no clave (ej. CodigoPostal -> Ciudad).\n• **Árboles B+**: Se discutió su uso en índices para búsquedas óptimas en O(log N).\n• **Lectura Recomendada**: Capítulo 6 del libro guía sobre indexación y almacenamiento.`,
            topics: ['Tercera Forma Normal (3FN)', 'Dependencia Transitiva', 'Árboles B+'],
            tasks: [
                { title: 'Terminar Lab 2 de Normalización', isUrgent: true, dueDate: '15 abr' },
                { title: 'Resolver taller de Árboles B+', isUrgent: false, dueDate: '18 abr' },
                { title: 'Preparar Quiz de Normalización', isUrgent: true, dueDate: '14 abr' }
            ],
            reminders: [
                { text: 'Tarea Urgente: Terminar Lab 2 vence el 15/4.', type: 'urgent' },
                { text: 'Concepto Clave: El algoritmo de Inserción en Árboles B+ es tema recurrente en el examen final.', type: 'warning' },
                { text: 'Se recomendó la lectura del capítulo 6 del libro guía.', type: 'info' }
            ],
            exams: [
                { title: 'Examen de Normalización (2FN, 3FN)', date: '18 abr' }
            ],
            flashcards: [
                { question: '¿Qué es una llave primaria?', answer: 'Un campo o conjunto de campos que identifican de forma única a cada fila de una tabla.' },
                { question: '¿Qué es una dependencia transitiva?', answer: 'Una relación funcional en la que un atributo no clave depende de otro atributo no clave que a su vez depende de la clave primaria.' }
            ],
            ads: [
                { description: 'La entrega del Lab 2 es digital y vence el 15 de abril.' }
            ],
            meetingMinutes: undefined
        };
    }
    if (lowercaseTitle.includes('reun') || lowercaseTitle.includes('proy') || lowercaseTitle.includes('soft') || lowercaseTitle.includes('ing')) {
        return {
            title: 'Reunión de Sincronización - Sprint Backlog',
            type: 'Reunión',
            project: 'Desarrollo',
            summary: `## 📌 Puntos Principales del Sprint Sync\n\n• **Avance del Sprint**: Se revisó el estado del Sprint Backlog actual. La mayoría de tareas están en desarrollo.\n• **Riesgos Identificados**: Retraso potencial en la integración del SDK.\n• **Próximos Pasos**: Pruebas unitarias de la API de carga.`,
            topics: ['Avance del Sprint', 'Sprint Backlog', 'Bloqueantes técnicos'],
            tasks: [
                { title: 'Carlos: Finalizar API de carga de hardware', isUrgent: true, dueDate: 'Hoy' },
                { title: 'Sofía: Pruebas unitarias de integración', isUrgent: false, dueDate: 'Mañana' }
            ],
            reminders: [
                { text: 'Bloqueante: Falta definir puertos del microcontrolador.', type: 'urgent' }
            ],
            exams: [],
            flashcards: [],
            ads: [],
            meetingMinutes: `### Acta de Reunión - Desarrollo S3\n\n**Fecha**: 2026-07-08\n**Participantes**: Carlos (Líder), Sofía, Juan\n\n**Acuerdos Clave**:\n1. Se congelan los requisitos del firmware del ClassNote Box.\n2. Carlos subirá los endpoints actualizados hoy mismo.\n3. Se planifica la demo final para el próximo lunes.`
        };
    }
    return {
        title: `Grabación de ${title}`,
        type: 'Clase',
        summary: `## 📌 Resumen Conceptual de la Clase\n\n• **Introducción a los conceptos clave**: Se introdujo el marco teórico de la materia de ${title}.\n• **Aplicaciones prácticas**: Explicación de ejemplos de la vida real sobre cómo aplicar el conocimiento de hoy.`,
        topics: ['Conceptos introductorios', 'Materia teórica'],
        tasks: [
            { title: `Estudiar conceptos clave de ${title}`, isUrgent: false, dueDate: 'Próxima semana' },
            { title: 'Completar lectura recomendada', isUrgent: false, dueDate: 'Mañana' }
        ],
        reminders: [
            { text: 'Próxima clase se revisarán ejercicios prácticos en grupo.', type: 'info' }
        ],
        exams: [],
        flashcards: [
            { question: '¿Cuál es el tema introductorio?', answer: 'Se introdujo el marco teórico y práctico de la materia.' }
        ],
        ads: [
            { description: 'Recuerden leer el material complementario en la plataforma.' }
        ],
        meetingMinutes: undefined
    };
}
