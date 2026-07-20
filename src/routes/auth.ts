import { Router, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/prisma';
import { isFirebaseInitialized, firebaseAdmin } from '../config/firebase';
import { logger } from '../utils/logger';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('AUTH ERROR', 'JWT_SECRET no está configurado en .env. El servidor no puede funcionar.');
  process.exit(1);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper: Generar JWT
const generateToken = (userId: string, email: string, role: string) => {
  return jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Validar el rol
    const userRole = role === 'company' ? 'company' : 'student';

    // Crear usuario
    const user = await prisma.user.create({
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
  } catch (error) {
    logger.error('AUTH', 'Error al registrar usuario', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'El correo y la contraseña son requeridos.' });
    }

    // Buscar usuario
    let user = await prisma.user.findUnique({ where: { email } });

    // Autocrear usuarios de prueba si no existen y usan las credenciales preestablecidas
    if (!user && (email === 'correo@universidad.edu' || email === 'empresa@classnote.com' || email === 'admin@classnote.com') && password === 'password123') {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      user = await prisma.user.create({
        data: {
          email,
          name: email === 'empresa@classnote.com' ? 'Microsoft Innovación' : 'Joel Benavides',
          passwordHash,
          role: email === 'empresa@classnote.com' ? 'company' : 'student'
        }
      });
      logger.info('AUTH', `Autocreado usuario demo de prueba en la BD: ${email}`);
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
    await prisma.user.update({
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
  } catch (error) {
    logger.error('AUTH', 'Error al iniciar sesión', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

// POST /api/auth/google
// Autenticación con Google OAuth 2.0 sin Firebase.
// Recibe un Google ID Token, lo verifica, y crea/busca el usuario.
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'El idToken de Google es requerido.' });
    }

    if (!GOOGLE_CLIENT_ID) {
      logger.error('AUTH GOOGLE', 'GOOGLE_CLIENT_ID no está configurado en .env');
      return res.status(500).json({ message: 'Google Auth no está configurado en el servidor.' });
    }

    // Verificar token con Google (valida audience, issuer, expiration)
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ message: 'Token de Google inválido: no se pudo obtener el email.' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || 'Usuario Google';
    const avatar = payload.picture || null;

    logger.info('AUTH GOOGLE', `Token verificado → email=${email}, googleId=${googleId}`);

    // Buscar usuario existente por googleId o por email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    });

    if (user) {
      // Usuario existe: actualizar datos de Google si es necesario
      const updateData: any = { updatedAt: new Date() };
      if (!user.googleId) updateData.googleId = googleId;
      if (!user.avatar && avatar) updateData.avatar = avatar;
      if (user.provider !== 'GOOGLE') updateData.provider = 'GOOGLE';

      if (Object.keys(updateData).length > 1) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }

      logger.info('AUTH GOOGLE', `Login existente → ${email} (id: ${user.id})`);
    } else {
      // Usuario nuevo: crear
      user = await prisma.user.create({
        data: {
          email,
          name,
          googleId,
          avatar,
          provider: 'GOOGLE',
          role: 'student'
        }
      });
      logger.info('AUTH GOOGLE', `Nuevo usuario creado → ${email} (id: ${user.id})`);
    }

    const token = generateToken(user.id, user.email, user.role);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        provider: user.provider
      }
    });
  } catch (error: any) {
    logger.error('AUTH GOOGLE', 'Error verificando token', error?.message || error);
    return res.status(401).json({ message: 'Token de Google inválido o expirado.' });
  }
});

// POST /api/auth/firebase (Social Logins)
router.post('/firebase', async (req: Request, res: Response) => {
  try {
    const { idToken, provider } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'El idToken de Firebase es requerido.' });
    }

    let email = '';
    let name = '';

    if (isFirebaseInitialized() && !idToken.startsWith('mock-')) {
      // Flujo Real con Firebase Admin SDK
      try {
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        email = decodedToken.email || '';
        name = decodedToken.name || 'Usuario Social';
      } catch (fbError) {
        logger.error('FIREBASE', 'Error de validación en Firebase Admin', fbError);
        return res.status(401).json({ message: 'Token de Firebase inválido.' });
      }
    } else {
      // Flujo de prueba / simulación (mock mode)
      logger.info('SIMULADOR DE FIREBASE', `Validando idToken para red social de proveedor: ${provider}`);
      email = `social-${provider}@universidad.edu`;
      name = `Estudiante ${provider.toUpperCase()}`;
    }

    if (!email) {
      return res.status(400).json({ message: 'No se pudo obtener el correo del token social.' });
    }

    // Buscar o registrar al usuario en PostgreSQL con Prisma
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: 'student'
        }
      });
      logger.info('BD', `Registrado nuevo usuario de red social: ${email}`);
    }

    // Actualizar updatedAt para que la reasignación automática de dispositivos funcione
    await prisma.user.update({
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
  } catch (error) {
    logger.error('FIREBASE', 'Error en Firebase Social Login', error);
    return res.status(500).json({ message: 'Error interno en el servidor.' });
  }
});

export default router;
