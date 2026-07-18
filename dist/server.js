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
// Cargar variables de entorno
dotenv.config();
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./config/prisma"));
const PORT = process.env.PORT || 5000;
// Asegurar que existe el usuario "system" para dispositivos auto-registrados
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
            console.log('[SYSTEM]: Usuario "system" creado para dispositivos auto-registrados.');
        }
    }
    catch (error) {
        console.error('[SYSTEM ERROR]:', error);
    }
}
ensureSystemUser();
// Cron job: Marcar dispositivos como inactive después de 90 segundos sin heartbeat
setInterval(async () => {
    try {
        const now = Date.now();
        const threshold = new Date(now - 90_000); // 90 segundos (ESP32 cada 15s)
        // Diagnosticar: mostrar todos los dispositivos activos y su lastSeenAt
        const activeDevices = await prisma_1.default.device.findMany({
            where: { status: 'active' },
            select: { id: true, macAddress: true, userId: true, lastSeenAt: true, status: true }
        });
        if (activeDevices.length > 0) {
            for (const d of activeDevices) {
                const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
                const secondsAgo = d.lastSeenAt ? ((now - lastSeenMs) / 1000).toFixed(1) : 'N/A';
                console.log(`[DEVICE CLEANUP DEBUG]: ${d.macAddress} userId=${d.userId} lastSeenAt=${d.lastSeenAt} (${secondsAgo}s ago) threshold=${threshold.toISOString()}`);
            }
        }
        const result = await prisma_1.default.device.updateMany({
            where: {
                status: 'active',
                lastSeenAt: { lt: threshold }
            },
            data: { status: 'inactive' }
        });
        if (result.count > 0) {
            console.log(`[DEVICE CLEANUP]: ${result.count} dispositivo(s) marcado(s) como inactivos (sin heartbeat por >90s)`);
        }
        else if (activeDevices.length > 0) {
            console.log(`[DEVICE CLEANUP]: ${activeDevices.length} dispositivo(s) activo(s) — todos con heartbeat reciente`);
        }
    }
    catch (error) {
        console.error('[DEVICE CLEANUP ERROR]:', error);
    }
}, 30_000); // Ejecutar cada 30 segundos para mejor diagnóstico
app_1.default.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`=============================================`);
    console.log(`🚀 ClassNote Box backend está corriendo en:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`=============================================`);
});
