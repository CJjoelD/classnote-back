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
exports.firebaseAdmin = exports.isFirebaseInitialized = void 0;
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
let firebaseAppInitialized = false;
try {
    const privateKeyPath = process.env.FIREBASE_PRIVATE_KEY_PATH;
    if (privateKeyPath) {
        // 1. Intentar resolver la ruta absoluta desde el directorio de ejecución actual (process.cwd())
        let absoluteKeyPath = path.resolve(privateKeyPath);
        // 2. Si no existe, intentar resolverla en base a la raíz de la carpeta del backend (donde reside firebase-key.json)
        if (!fs.existsSync(absoluteKeyPath)) {
            absoluteKeyPath = path.join(__dirname, '../../', privateKeyPath);
        }
        if (fs.existsSync(absoluteKeyPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(absoluteKeyPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            firebaseAppInitialized = true;
            logger_1.logger.info('FIREBASE', 'Inicializado con éxito usando credenciales desde: ' + absoluteKeyPath);
        }
        else {
            logger_1.logger.warn('FIREBASE', `No se encontró el archivo físico en: ${absoluteKeyPath}. Se usará el simulador.`);
        }
    }
    else {
        logger_1.logger.warn('FIREBASE', 'No se encontró la variable FIREBASE_PRIVATE_KEY_PATH en el .env. Se usará el simulador.');
    }
}
catch (error) {
    logger_1.logger.error('FIREBASE', 'Error al inicializar firebase-admin:', error);
}
const isFirebaseInitialized = () => firebaseAppInitialized;
exports.isFirebaseInitialized = isFirebaseInitialized;
exports.firebaseAdmin = admin;
exports.default = admin;
