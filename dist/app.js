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
const path = __importStar(require("path"));
// Importar Rutas
const auth_1 = __importDefault(require("./routes/auth"));
const classes_1 = __importDefault(require("./routes/classes"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const reminders_1 = __importDefault(require("./routes/reminders"));
const groups_1 = __importDefault(require("./routes/groups"));
const devices_1 = __importDefault(require("./routes/devices"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const app = (0, express_1.default)();
// Configurar middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Servir estáticos de audios subidos
app.use('/uploads', express_1.default.static(path.join(__dirname, '../uploads')));
// Registro de endpoints
app.use('/api/auth', auth_1.default);
app.use('/api/classes', classes_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/reminders', reminders_1.default);
app.use('/api/groups', groups_1.default);
app.use('/api/devices', devices_1.default);
app.use('/api/analytics', analytics_1.default);
// Ruta de salud de la API
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});
exports.default = app;
