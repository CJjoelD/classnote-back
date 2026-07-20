"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, _next) {
    logger_1.logger.error('ERROR HANDLER', `${req.method} ${req.path}`, err);
    if (!res.headersSent) {
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor.',
            error: process.env.NODE_ENV === 'production' ? undefined : err.message,
            timestamp: new Date().toISOString(),
        });
    }
}
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        message: `Ruta no encontrada: ${req.method} ${req.path}`,
        timestamp: new Date().toISOString(),
    });
}
