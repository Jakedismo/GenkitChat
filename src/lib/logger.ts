export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  component?: string;
  action?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.minLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = LogLevel[entry.level];
    const message = entry.message;
    
    if (this.isDevelopment) {
      // Pretty format for development
      const contextStr = entry.context ? ` [${JSON.stringify(entry.context)}]` : '';
      const errorStr = entry.error ? `\nError: ${entry.error.message}\n${entry.error.stack}` : '';
      return `[${timestamp}] ${level}: ${message}${contextStr}${errorStr}`;
    } else {
      // JSON format for production
      return JSON.stringify(entry);
    }
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      };
    }

    const formattedMessage = this.formatMessage(entry);

    // Route to appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Convenience methods for common scenarios
  apiRequest(method: string, path: string, context?: Omit<LogContext, 'action'>): void {
    this.info(`API ${method} ${path}`, {
      ...context,
      action: 'api_request',
    });
  }

  apiResponse(method: string, path: string, statusCode: number, duration: number, context?: Omit<LogContext, 'action' | 'duration'>): void {
    const level = statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO;
    this.log(level, `API ${method} ${path} - ${statusCode}`, {
      ...context,
      action: 'api_response',
      duration,
      metadata: { statusCode },
    });
  }

  fileOperation(operation: string, fileName: string, success: boolean, context?: Omit<LogContext, 'action'>): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(level, `File ${operation}: ${fileName} - ${success ? 'success' : 'failed'}`, {
      ...context,
      action: 'file_operation',
      metadata: { operation, fileName, success },
    });
  }

  chatMessage(direction: 'incoming' | 'outgoing', messageLength: number, context?: Omit<LogContext, 'action'>): void {
    this.info(`Chat message ${direction} (${messageLength} chars)`, {
      ...context,
      action: 'chat_message',
      metadata: { direction, messageLength },
    });
  }

  ragOperation(operation: string, sessionId: string, success: boolean, context?: Omit<LogContext, 'action' | 'sessionId'>): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(level, `RAG ${operation} - ${success ? 'success' : 'failed'}`, {
      ...context,
      sessionId,
      action: 'rag_operation',
      metadata: { operation, success },
    });
  }

  performance(operation: string, duration: number, context?: Omit<LogContext, 'action' | 'duration'>): void {
    const level = duration > 5000 ? LogLevel.WARN : LogLevel.INFO; // Warn if operation takes > 5s
    this.log(level, `Performance: ${operation} took ${duration}ms`, {
      ...context,
      action: 'performance',
      duration,
      metadata: { operation },
    });
  }

  security(event: string, severity: 'low' | 'medium' | 'high', context?: Omit<LogContext, 'action'>): void {
    const level = severity === 'high' ? LogLevel.ERROR : severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, `Security event: ${event}`, {
      ...context,
      action: 'security_event',
      metadata: { event, severity },
    });
  }

  // Method to create a child logger with default context
  child(defaultContext: LogContext): Logger {
    const childLogger = new Logger();
    
    // Override log method to include default context
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level: LogLevel, message: string, context?: LogContext, error?: Error) => {
      const mergedContext = { ...defaultContext, ...context };
      originalLog(level, message, mergedContext, error);
    };

    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions for backward compatibility
export const logDebug = logger.debug.bind(logger);
export const logInfo = logger.info.bind(logger);
export const logWarn = logger.warn.bind(logger);
export const logError = logger.error.bind(logger);

// Higher-order function to add logging to functions
export function withLogging<T extends (...args: unknown[]) => unknown>(
  fn: T,
  operation: string,
  context?: LogContext
): T {
  return ((...args: unknown[]) => {
    const start = Date.now();
    const logContext = { ...context, component: context?.component || fn.name };
    
    logger.debug(`Starting ${operation}`, logContext);
    
    try {
      const result = fn(...args);
      
      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((value) => {
            const duration = Date.now() - start;
            logger.performance(operation, duration, logContext);
            return value;
          })
          .catch((error) => {
            const duration = Date.now() - start;
            logger.error(`${operation} failed`, { ...logContext, duration }, error);
            throw error;
          });
      } else {
        const duration = Date.now() - start;
        logger.performance(operation, duration, logContext);
        return result;
      }
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`${operation} failed`, { ...logContext, duration }, error as Error);
      throw error;
    }
  }) as T;
}

// Middleware for API routes
export function createApiLogger(path: string) {
  return logger.child({ component: 'api', metadata: { path } });
}
