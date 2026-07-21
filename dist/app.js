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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const path = __importStar(require("path"));
const auth_1 = __importDefault(require("./routes/auth"));
const classes_1 = __importDefault(require("./routes/classes"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const reminders_1 = __importDefault(require("./routes/reminders"));
const groups_1 = __importDefault(require("./routes/groups"));
const devices_1 = __importDefault(require("./routes/devices"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const admin_1 = __importDefault(require("./routes/admin"));
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimiter_1 = require("./middleware/rateLimiter");
const app = (0, express_1.default)();
const startTime = Date.now();
// 💡 CLAVE PARA RAILWAY: Confiar en el Reverse Proxy de Railway para obtener HTTPS y Host correcto
app.set('trust proxy', true);
// Seguridad: Permitir descarga de archivos multimedia (audios) desde orígenes cruzados (Vercel)
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
}));
app.use((0, compression_1.default)());
// CORS
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['*'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true,
}));
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Ocultar X-Powered-By
app.disable('x-powered-by');
// Estáticos (Servir la carpeta uploads públicamente con cabeceras de origen cruzado para reproducción audio/media)
app.use('/uploads', express_1.default.static(path.join(__dirname, '../uploads'), {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));
// Rate limiters por ruta
app.use('/api/auth', rateLimiter_1.authLimiter, auth_1.default);
app.use('/api/classes/upload-hardware', rateLimiter_1.uploadLimiter);
app.use('/api/classes', classes_1.default);
app.use('/api/tasks', rateLimiter_1.generalLimiter, tasks_1.default);
app.use('/api/reminders', rateLimiter_1.generalLimiter, reminders_1.default);
app.use('/api/groups', rateLimiter_1.generalLimiter, groups_1.default);
app.use('/api/devices/heartbeat', rateLimiter_1.heartbeatLimiter);
app.use('/api/devices', devices_1.default);
app.use('/api/analytics', rateLimiter_1.generalLimiter, analytics_1.default);
app.use('/api/admin', rateLimiter_1.adminLimiter, admin_1.default);
// Health check mejorado
app.get('/health', async (_req, res) => {
    let dbStatus = 'ok';
    try {
        const { default: prisma } = await Promise.resolve().then(() => __importStar(require('./config/prisma')));
        await prisma.$queryRaw `SELECT 1`;
    }
    catch {
        dbStatus = 'error';
    }
    res.json({
        status: dbStatus === 'ok' ? 'ok' : 'degraded',
        database: dbStatus,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: process.env.npm_package_version || '1.0.0',
    });
});
// Métricas
app.get('/metrics', async (_req, res) => {
    try {
        const { default: prisma } = await Promise.resolve().then(() => __importStar(require('./config/prisma')));
        const mem = process.memoryUsage();
        const [users, devices, classes] = await Promise.all([
            prisma.user.count({ where: { id: { not: 'system' } } }),
            prisma.device.count(),
            prisma.class.count(),
        ]);
        res.json({
            uptime: Math.floor((Date.now() - startTime) / 1000),
            memory: {
                rss: `${(mem.rss / 1048576).toFixed(1)} MB`,
                heapUsed: `${(mem.heapUsed / 1048576).toFixed(1)} MB`,
                heapTotal: `${(mem.heapTotal / 1048576).toFixed(1)} MB`,
            },
            cpu: process.cpuUsage(),
            counts: { users, devices, classes },
        });
    }
    catch (err) {
        res.status(500).json({ error: 'No se pudieron obtener métricas.' });
    }
});
// 404 para rutas no encontradas
app.use(errorHandler_1.notFoundHandler);
// Error handler global (debe ser el último)
app.use(errorHandler_1.errorHandler);
exports.default = app;
