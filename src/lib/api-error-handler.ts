import { NextResponse } from "next/server";

export interface ApiError {
  message: string;
  code?: string;
  statusCode: number;
  details?: unknown;
  timestamp: string;
  path?: string;
}

export interface ErrorContext {
  path?: string;
  method?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

/**
 * Standardized error response creator
 */
export function createErrorResponse(
  error: Error | unknown,
  statusCode: number = 500,
  context?: ErrorContext
): NextResponse {
  const apiError: ApiError = {
    message: error instanceof Error ? error.message : String(error),
    statusCode,
    timestamp: new Date().toISOString(),
    path: context?.path,
  };

  // Add error code if available
  if (error instanceof Error && 'code' in error) {
    apiError.code = String(error.code);
  }

  // Add details for development
  if (process.env.NODE_ENV === 'development') {
    apiError.details = {
      stack: error instanceof Error ? error.stack : undefined,
      context,
    };
  }

  // Log error for monitoring
  console.error('[API Error]', {
    ...apiError,
    context,
    originalError: error,
  });

  return NextResponse.json(
    { error: apiError },
    { status: statusCode }
  );
}

/**
 * Validation error response
 */
export function createValidationErrorResponse(
  validationErrors: Array<{ field: string; message: string }>,
  context?: ErrorContext
): NextResponse {
  const apiError: ApiError = {
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    timestamp: new Date().toISOString(),
    path: context?.path,
    details: validationErrors,
  };

  console.error('[Validation Error]', { apiError, context });

  return NextResponse.json(
    { error: apiError },
    { status: 400 }
  );
}

/**
 * Authentication error response
 */
export function createAuthErrorResponse(
  message: string = 'Authentication required',
  context?: ErrorContext
): NextResponse {
  const apiError: ApiError = {
    message,
    code: 'AUTH_ERROR',
    statusCode: 401,
    timestamp: new Date().toISOString(),
    path: context?.path,
  };

  console.error('[Auth Error]', { apiError, context });

  return NextResponse.json(
    { error: apiError },
    { status: 401 }
  );
}

/**
 * Rate limiting error response
 */
export function createRateLimitErrorResponse(
  retryAfter?: number,
  context?: ErrorContext
): NextResponse {
  const apiError: ApiError = {
    message: 'Rate limit exceeded',
    code: 'RATE_LIMIT_ERROR',
    statusCode: 429,
    timestamp: new Date().toISOString(),
    path: context?.path,
  };

  console.error('[Rate Limit Error]', { apiError, context });

  const headers: Record<string, string> = {};
  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter);
  }

  return NextResponse.json(
    { error: apiError },
    { status: 429, headers }
  );
}

/**
 * File processing error response
 */
export function createFileErrorResponse(
  message: string,
  context?: ErrorContext & { fileName?: string; fileSize?: number }
): NextResponse {
  const apiError: ApiError = {
    message,
    code: 'FILE_ERROR',
    statusCode: 422,
    timestamp: new Date().toISOString(),
    path: context?.path,
    details: {
      fileName: context?.fileName,
      fileSize: context?.fileSize,
    },
  };

  console.error('[File Error]', { apiError, context });

  return NextResponse.json(
    { error: apiError },
    { status: 422 }
  );
}

/**
 * Higher-order function to wrap API routes with error handling
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  context?: Omit<ErrorContext, 'path'>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return createErrorResponse(error, 500, context);
    }
  };
}

/**
 * Async error boundary for API routes
 */
export async function safeApiCall<T>(
  operation: () => Promise<T>,
  context?: ErrorContext
): Promise<{ success: true; data: T } | { success: false; error: NextResponse }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: createErrorResponse(error, 500, context),
    };
  }
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'statusCode' in error &&
    'timestamp' in error
  );
}

/**
 * Error classification helper
 */
export function classifyError(error: unknown): {
  type: 'validation' | 'auth' | 'rate_limit' | 'file' | 'network' | 'server' | 'unknown';
  statusCode: number;
  isRetryable: boolean;
} {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation') || message.includes('invalid')) {
      return { type: 'validation', statusCode: 400, isRetryable: false };
    }
    
    if (message.includes('auth') || message.includes('unauthorized')) {
      return { type: 'auth', statusCode: 401, isRetryable: false };
    }
    
    if (message.includes('rate limit') || message.includes('too many')) {
      return { type: 'rate_limit', statusCode: 429, isRetryable: true };
    }
    
    if (message.includes('file') || message.includes('upload')) {
      return { type: 'file', statusCode: 422, isRetryable: false };
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return { type: 'network', statusCode: 503, isRetryable: true };
    }
    
    if (message.includes('server') || message.includes('internal')) {
      return { type: 'server', statusCode: 500, isRetryable: true };
    }
  }
  
  return { type: 'unknown', statusCode: 500, isRetryable: false };
}
