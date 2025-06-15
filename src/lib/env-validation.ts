import { z } from 'zod';
import { logger } from './logger';

// Define the schema for environment variables
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // API Keys (at least one Google AI key is required)
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  
  // External service API keys
  TAVILY_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  
  // Feature flags
  ENABLE_TAVILY_SEARCH: z.string().transform(val => val === 'true').default('false'),
  ENABLE_TAVILY_EXTRACT: z.string().transform(val => val === 'true').default('false'),
  ENABLE_PERPLEXITY_SEARCH: z.string().transform(val => val === 'true').default('false'),
  ENABLE_PERPLEXITY_DEEP_RESEARCH: z.string().transform(val => val === 'true').default('false'),
  ENABLE_CONTEXT7_RESOLVE_LIBRARY_ID: z.string().transform(val => val === 'true').default('false'),
  ENABLE_CONTEXT7_GET_LIBRARY_DOCS: z.string().transform(val => val === 'true').default('false'),
  
  // Server configuration
  PORT: z.string().transform(val => parseInt(val, 10)).default('9002'),
  ALLOWED_ORIGINS: z.string().optional(),
  
  // Build configuration
  NEXT_BUILD: z.string().optional(),
  NEXT_PHASE: z.string().optional(),
  TURBOPACK: z.string().optional(),
  
  // Database/Storage (if applicable)
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  
  // Monitoring and logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().optional(),
  
  // Security
  JWT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

// Refined schema with custom validation
const refinedEnvSchema = envSchema.refine(
  (data) => {
    // At least one Google AI API key must be provided
    return data.GEMINI_API_KEY || data.GOOGLE_API_KEY;
  },
  {
    message: 'Either GEMINI_API_KEY or GOOGLE_API_KEY must be provided',
    path: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  }
).refine(
  (data) => {
    // If Tavily features are enabled, API key must be provided
    if ((data.ENABLE_TAVILY_SEARCH || data.ENABLE_TAVILY_EXTRACT) && !data.TAVILY_API_KEY) {
      return false;
    }
    return true;
  },
  {
    message: 'TAVILY_API_KEY is required when Tavily features are enabled',
    path: ['TAVILY_API_KEY'],
  }
).refine(
  (data) => {
    // If Perplexity features are enabled, API key must be provided
    if ((data.ENABLE_PERPLEXITY_SEARCH || data.ENABLE_PERPLEXITY_DEEP_RESEARCH) && !data.PERPLEXITY_API_KEY) {
      return false;
    }
    return true;
  },
  {
    message: 'PERPLEXITY_API_KEY is required when Perplexity features are enabled',
    path: ['PERPLEXITY_API_KEY'],
  }
);

export type EnvConfig = z.infer<typeof refinedEnvSchema>;

let validatedEnv: EnvConfig | null = null;

/**
 * Validates environment variables and returns the validated configuration
 */
export function validateEnv(): EnvConfig {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    validatedEnv = refinedEnvSchema.parse(process.env);
    
    logger.info('Environment variables validated successfully', {
      component: 'env-validation',
      metadata: {
        nodeEnv: validatedEnv.NODE_ENV,
        hasGeminiKey: !!validatedEnv.GEMINI_API_KEY,
        hasGoogleKey: !!validatedEnv.GOOGLE_API_KEY,
        hasOpenAIKey: !!validatedEnv.OPENAI_API_KEY,
        hasTavilyKey: !!validatedEnv.TAVILY_API_KEY,
        hasPerplexityKey: !!validatedEnv.PERPLEXITY_API_KEY,
        enabledFeatures: {
          tavilySearch: validatedEnv.ENABLE_TAVILY_SEARCH,
          tavilyExtract: validatedEnv.ENABLE_TAVILY_EXTRACT,
          perplexitySearch: validatedEnv.ENABLE_PERPLEXITY_SEARCH,
          perplexityDeepResearch: validatedEnv.ENABLE_PERPLEXITY_DEEP_RESEARCH,
          context7ResolveLibraryId: validatedEnv.ENABLE_CONTEXT7_RESOLVE_LIBRARY_ID,
          context7GetLibraryDocs: validatedEnv.ENABLE_CONTEXT7_GET_LIBRARY_DOCS,
        },
      },
    });

    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      
      logger.error('Environment variable validation failed', {
        component: 'env-validation',
        metadata: {
          errors: error.errors,
          errorMessages,
        },
      }, error);

      throw new Error(`Environment validation failed: ${errorMessages}`);
    }
    
    logger.error('Unexpected error during environment validation', {
      component: 'env-validation',
    }, error as Error);
    
    throw error;
  }
}

/**
 * Gets a validated environment variable value
 */
export function getEnvVar<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  const env = validateEnv();
  return env[key];
}

/**
 * Checks if a feature is enabled based on environment variables
 */
export function isFeatureEnabled(feature: keyof Pick<EnvConfig, 
  | 'ENABLE_TAVILY_SEARCH' 
  | 'ENABLE_TAVILY_EXTRACT' 
  | 'ENABLE_PERPLEXITY_SEARCH' 
  | 'ENABLE_PERPLEXITY_DEEP_RESEARCH'
  | 'ENABLE_CONTEXT7_RESOLVE_LIBRARY_ID'
  | 'ENABLE_CONTEXT7_GET_LIBRARY_DOCS'
>): boolean {
  return getEnvVar(feature);
}

/**
 * Gets the appropriate API key for a service
 */
export function getApiKey(service: 'google' | 'openai' | 'tavily' | 'perplexity'): string | undefined {
  const env = validateEnv();
  
  switch (service) {
    case 'google':
      return env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    case 'openai':
      return env.OPENAI_API_KEY;
    case 'tavily':
      return env.TAVILY_API_KEY;
    case 'perplexity':
      return env.PERPLEXITY_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Validates that required API keys are available for enabled features
 */
export function validateFeatureDependencies(): void {
  const env = validateEnv();
  
  const issues: string[] = [];
  
  if (env.ENABLE_TAVILY_SEARCH && !env.TAVILY_API_KEY) {
    issues.push('Tavily Search is enabled but TAVILY_API_KEY is missing');
  }
  
  if (env.ENABLE_TAVILY_EXTRACT && !env.TAVILY_API_KEY) {
    issues.push('Tavily Extract is enabled but TAVILY_API_KEY is missing');
  }
  
  if (env.ENABLE_PERPLEXITY_SEARCH && !env.PERPLEXITY_API_KEY) {
    issues.push('Perplexity Search is enabled but PERPLEXITY_API_KEY is missing');
  }
  
  if (env.ENABLE_PERPLEXITY_DEEP_RESEARCH && !env.PERPLEXITY_API_KEY) {
    issues.push('Perplexity Deep Research is enabled but PERPLEXITY_API_KEY is missing');
  }
  
  if (issues.length > 0) {
    logger.error('Feature dependency validation failed', {
      component: 'env-validation',
      metadata: { issues },
    });
    
    throw new Error(`Feature dependencies not met: ${issues.join(', ')}`);
  }
}

/**
 * Returns a safe environment summary for logging (without sensitive data)
 */
export function getEnvSummary(): Record<string, unknown> {
  try {
    const env = validateEnv();
    return {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      hasRequiredKeys: !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
      enabledFeatures: {
        tavily: env.ENABLE_TAVILY_SEARCH || env.ENABLE_TAVILY_EXTRACT,
        perplexity: env.ENABLE_PERPLEXITY_SEARCH || env.ENABLE_PERPLEXITY_DEEP_RESEARCH,
        context7: env.ENABLE_CONTEXT7_RESOLVE_LIBRARY_ID || env.ENABLE_CONTEXT7_GET_LIBRARY_DOCS,
      },
    };
  } catch {
    return { error: 'Environment validation failed' };
  }
}

// Initialize validation on module load (but don't throw in build environments)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  try {
    validateEnv();
  } catch (error) {
    // Only log the error during build, don't throw
    if (process.env.NEXT_BUILD === 'true') {
      console.warn('Environment validation skipped during build');
    } else {
      console.error('Environment validation failed:', error);
      // In development, we want to know about env issues immediately
      if (process.env.NODE_ENV === 'development') {
        throw error;
      }
    }
  }
}
