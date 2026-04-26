const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '../../logs');

const fmt = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`)
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fmt,
  transports: [
    // Console — always on
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        fmt
      )
    }),
    // Rotating daily log files
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',   // keep 14 days
      maxSize: '20m',
      zippedArchive: true,
    }),
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;
