import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

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
      console.log('[FIREBASE]: Inicializado con éxito usando credenciales desde:', absoluteKeyPath);
    } else {
      console.warn(`[FIREBASE WARNING]: No se encontró el archivo físico en: ${absoluteKeyPath}. Se usará el simulador.`);
    }
  } else {
    console.warn('[FIREBASE WARNING]: No se encontró la variable FIREBASE_PRIVATE_KEY_PATH en el .env. Se usará el simulador.');
  }
} catch (error) {
  console.error('[FIREBASE ERROR]: Error al inicializar firebase-admin:', error);
}

export const isFirebaseInitialized = () => firebaseAppInitialized;
export const firebaseAdmin = admin;
export default admin;
