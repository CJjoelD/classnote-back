import express from 'express';
import cors from 'cors';
import * as path from 'path';

// Importar Rutas
import authRouter from './routes/auth';
import classesRouter from './routes/classes';
import tasksRouter from './routes/tasks';
import remindersRouter from './routes/reminders';
import groupsRouter from './routes/groups';
import devicesRouter from './routes/devices';
import analyticsRouter from './routes/analytics';

const app = express();

// Configurar middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir estáticos de audios subidos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Registro de endpoints
app.use('/api/auth', authRouter);
app.use('/api/classes', classesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/analytics', analyticsRouter);

// Ruta de salud de la API
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

export default app;
