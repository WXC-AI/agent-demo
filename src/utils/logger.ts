type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'INFO') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map((arg) => JSON.stringify(arg)).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('DEBUG')) {
      console.debug(this.formatMessage('DEBUG', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('INFO')) {
      console.info(this.formatMessage('INFO', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }
}

export const logger = new Logger();
