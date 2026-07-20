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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const validateEnv_1 = require("./utils/validateEnv");
(0, validateEnv_1.validateEnv)();
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./config/prisma"));
const logger_1 = require("./utils/logger");
const PORT = process.env.PORT || 5000;
async function ensureSystemUser() {
    try {
        const existing = await prisma_1.default.user.findUnique({ where: { id: 'system' } });
        if (!existing) {
            await prisma_1.default.user.create({
                data: {
                    id: 'system',
                    email: 'system@classnote.local',
                    name: 'ClassNote System',
                    role: 'student'
                }
            });
            logger_1.logger.info('SYSTEM', 'Usuario "system" creado');
        }
    }
    catch (error) {
        logger_1.logger.error('SYSTEM', 'Error creando usuario system', error);
    }
}
async function start() {
    await ensureSystemUser();
    // Cron: marcar dispositivos offline despues de 10s sin heartbeat
    setInterval(async () => {
        try {
            const threshold = new Date(Date.now() - 10_000);
            const result = await prisma_1.default.device.updateMany({
                where: { isOnline: true, lastSeenAt: { lt: threshold } },
                data: { isOnline: false }
            });
            if (result.count > 0) {
                logger_1.logger.info('CRON', `${result.count} dispositivo(s) marcado(s) como offline`);
            }
        }
        catch (error) {
            logger_1.logger.error('CRON', 'Error en cleanup de dispositivos', error);
        }
    }, 10_000);
    app_1.default.listen(Number(PORT), '0.0.0.0', () => {
        logger_1.logger.info('SERVER', `ClassNote Backend corriendo en http://0.0.0.0:${PORT}`);
        logger_1.logger.info('SERVER', `Health: http://localhost:${PORT}/health`);
        logger_1.logger.info('SERVER', `Metrics: http://localhost:${PORT}/metrics`);
    });
}
start();
