"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = validateEnv;
const REQUIRED_VARS = [
    'DATABASE_URL',
    'JWT_SECRET',
];
const RECOMMENDED_VARS = [
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_ID',
];
function validateEnv() {
    const missing = [];
    for (const v of REQUIRED_VARS) {
        if (!process.env[v])
            missing.push(v);
    }
    if (missing.length > 0) {
        console.error(`\x1b[31m[FATAL] Variables de entorno requeridas faltantes: ${missing.join(', ')}\x1b[0m`);
        console.error('El servidor no puede iniciar sin estas variables. revisa tu archivo .env\n');
        process.exit(1);
    }
    const warnings = [];
    for (const v of RECOMMENDED_VARS) {
        if (!process.env[v])
            warnings.push(v);
    }
    if (warnings.length > 0) {
        console.warn(`\x1b[33m[WARN] Variables recomendadas no configuradas: ${warnings.join(', ')}\x1b[0m`);
        console.warn('Algunas funcionalidades pueden no estar disponibles.\n');
    }
}
