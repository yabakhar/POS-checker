const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('./config');

const fileTransport = new winston.transports.DailyRotateFile({
  dirname: config.log.dir,
  filename: 'agent-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '30d',
});

const logger = winston.createLogger({
  level: config.log.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${extra}`;
    })
  ),
  transports: [
    fileTransport,
    new winston.transports.Console(),
  ],
});

module.exports = logger;
