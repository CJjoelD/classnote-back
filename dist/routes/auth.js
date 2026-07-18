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
const bcrypt = __importStar(require("bcrypt"));
const jwt = __importStar(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const firebase_1 = require("../config/firebase");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[AUTH ERROR]: JWT_SECRET no está configurado en .env. El servidor no puede funcionar.');
    process.exit(1);
}
// Helper: Generar JWT
const generateToken = (userId, email, role) => {
    return jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });
};
// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Todos los campos son requeridos.' });
        }
        // Verificar si el usuario ya existe
        const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }
        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        // Validar el rol
        const userRole = role === 'company' ? 'company' : 'student';
        // Crear usuario
        const user = await prisma_1.default.user.create({
            data: {
                name,
                email,
                passwordHash,
                role: userRole
            }
        });
        const token = generateToken(user.id, user.email, user.role);
        return res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error('Error al registrar usuario:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'El correo y la contraseña son requeridos.' });
        }
        // Buscar usuario
        let user = await prisma_1.default.user.findUnique({ where: { email } });
        // Autocrear usuarios de prueba si no existen y usan las credenciales preestablecidas
        if (!user && (email === 'correo@universidad.edu' || email === 'empresa@classnote.com' || email === 'admin@classnote.com') && password === 'password123') {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            user = await prisma_1.default.user.create({
                data: {
                    email,
                    name: email === 'empresa@classnote.com' ? 'Microsoft Innovación' : 'Joel Benavides',
                    passwordHash,
                    role: email === 'empresa@classnote.com' ? 'company' : 'student'
                }
            });
            console.log(`[AUTH]: Autocreado usuario demo de prueba en la BD: ${email}`);
        }
        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }
        // Si es un usuario social sin contraseña
        if (!user.passwordHash) {
            return res.status(400).json({ message: 'Este correo se registró mediante una red social. Inicia sesión con Google/Facebook.' });
        }
        // Validar contraseña
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }
        // Actualizar updatedAt para que el "usuario más reciente" funcione correctamente
        // con la reasignación automática de dispositivos ESP32
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: { updatedAt: new Date() }
        });
        const token = generateToken(user.id, user.email, user.role);
        return res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error('Error al iniciar sesión:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
// POST /api/auth/firebase (Social Logins)
router.post('/firebase', async (req, res) => {
    try {
        const { idToken, provider } = req.body;
        if (!idToken) {
            return res.status(400).json({ message: 'El idToken de Firebase es requerido.' });
        }
        let email = '';
        let name = '';
        if ((0, firebase_1.isFirebaseInitialized)() && !idToken.startsWith('mock-')) {
            // Flujo Real con Firebase Admin SDK
            try {
                const decodedToken = await firebase_1.firebaseAdmin.auth().verifyIdToken(idToken);
                email = decodedToken.email || '';
                name = decodedToken.name || 'Usuario Social';
            }
            catch (fbError) {
                console.error('Error de validación en Firebase Admin:', fbError);
                return res.status(401).json({ message: 'Token de Firebase inválido.' });
            }
        }
        else {
            // Flujo de prueba / simulación (mock mode)
            console.log(`[SIMULADOR DE FIREBASE]: Validando idToken para red social de proveedor: ${provider}`);
            email = `social-${provider}@universidad.edu`;
            name = `Estudiante ${provider.toUpperCase()}`;
        }
        if (!email) {
            return res.status(400).json({ message: 'No se pudo obtener el correo del token social.' });
        }
        // Buscar o registrar al usuario en PostgreSQL con Prisma
        let user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            user = await prisma_1.default.user.create({
                data: {
                    email,
                    name,
                    role: 'student'
                }
            });
            console.log(`[BD]: Registrado nuevo usuario de red social: ${email}`);
        }
        // Actualizar updatedAt para que la reasignación automática de dispositivos funcione
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: { updatedAt: new Date() }
        });
        const token = generateToken(user.id, user.email, user.role);
        return res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error('Error en Firebase Social Login:', error);
        return res.status(500).json({ message: 'Error interno en el servidor.' });
    }
});
exports.default = router;
