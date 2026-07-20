import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('ERROR HANDLER', `${req.method} ${req.path}`, err);

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor.',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
}
