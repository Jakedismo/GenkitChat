// src/ai/validatePrompts.ts
// Utility to validate prompt files and partials are correctly loaded

import fs from 'fs';
import path from 'path';

// Build-time detection to prevent file system operations during Next.js build analysis
const isBuildTime = process.env.NEXT_BUILD === "true" ||
                   process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build" ||
                   typeof process.cwd !== 'function' ||
                   process.env.TURBOPACK === "1";

interface PromptValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  promptsFound: string[];
  partialsFound: string[];
}

/**
 * Validates that all prompt files and their partials can be found and loaded
 */
export function validatePromptDirectory(promptDir: string): PromptValidationResult {
  // During build, skip validation and return success to avoid file system errors
  if (isBuildTime) {
    console.log(`[Prompt Validation] Skipping validation during build analysis.`);
    return {
      success: true,
      errors: [],
      warnings: [],
      promptsFound: [],
      partialsFound: [],
    };
  }

  const result: PromptValidationResult = {
    success: true,
    errors: [],
    warnings: [],
    promptsFound: [],
    partialsFound: []
  };

  console.log(`🔍 Validating prompt directory: ${promptDir}`);

  // Check if prompt directory exists
  if (!fs.existsSync(promptDir)) {
    result.success = false;
    result.errors.push(`Prompt directory does not exist: ${promptDir}`);
    return result;
  }

  try {
    const files = fs.readdirSync(promptDir);
    const promptFiles = files.filter(f => f.endsWith('.prompt'));
    const partialFiles = files.filter(f => f.startsWith('_') && f.endsWith('.prompt'));
    
    result.promptsFound = promptFiles;
    result.partialsFound = partialFiles;

    console.log(`📁 Found ${promptFiles.length} prompt files and ${partialFiles.length} partials`);

    // Validate each non-partial prompt file
    for (const promptFile of promptFiles.filter(f => !f.startsWith('_'))) {
      const filePath = path.join(promptDir, promptFile);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for partial references in the format {{>partialName}}
        const partialMatches = content.match(/\{\{>\s*([^}\s]+)/g);
        if (partialMatches) {
          for (const match of partialMatches) {
            const partialName = match.replace(/\{\{>\s*/, '').trim();
            const expectedPartialFile = `${partialName}.prompt`;
            
            if (!partialFiles.includes(expectedPartialFile)) {
              result.success = false;
              result.errors.push(
                `Prompt "${promptFile}" references partial "${partialName}" but "${expectedPartialFile}" not found in directory`
              );
            } else {
              console.log(`✓ Partial "${partialName}" found for prompt "${promptFile}"`);
            }
          }
        }
      } catch (error) {
        result.success = false;
        result.errors.push(`Failed to read prompt file "${promptFile}": ${error}`);
      }
    }

    // Check for orphaned partials (partials not referenced by any prompt)
    const referencedPartials = new Set<string>();
    for (const promptFile of promptFiles.filter(f => !f.startsWith('_'))) {
      const filePath = path.join(promptDir, promptFile);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const partialMatches = content.match(/\{\{>\s*([^}\s]+)/g);
        if (partialMatches) {
          partialMatches.forEach(match => {
            const partialName = match.replace(/\{\{>\s*/, '').trim();
            referencedPartials.add(`${partialName}.prompt`);
          });
        }
      } catch {
        // Already handled above
      }
    }

    for (const partialFile of partialFiles) {
      if (!referencedPartials.has(partialFile)) {
        result.warnings.push(`Partial "${partialFile}" is not referenced by any prompt file`);
      }
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Failed to read prompt directory: ${error}`);
  }

  return result;
}

/**
 * Test function specifically for the _assistant_intro partial issue
 */
export function validateAssistantIntroPartial(promptDir: string): boolean {
  // During build, skip validation and return true
  if (isBuildTime) {
    console.log(`[Prompt Validation] Skipping _assistant_intro partial validation during build.`);
    return true;
  }

  console.log(`🔍 Specifically validating _assistant_intro partial...`);
  
  const assistantIntroPath = path.join(promptDir, '_assistant_intro.prompt');
  const ragAssistantPath = path.join(promptDir, 'rag_assistant.prompt');
  
  // Check if _assistant_intro.prompt exists
  if (!fs.existsSync(assistantIntroPath)) {
    console.error(`❌ _assistant_intro.prompt not found at: ${assistantIntroPath}`);
    return false;
  }
  
  console.log(`✓ _assistant_intro.prompt exists at: ${assistantIntroPath}`);
  
  // Check if rag_assistant.prompt exists and references _assistant_intro
  if (!fs.existsSync(ragAssistantPath)) {
    console.error(`❌ rag_assistant.prompt not found at: ${ragAssistantPath}`);
    return false;
  }
  
  try {
    const ragContent = fs.readFileSync(ragAssistantPath, 'utf8');
    if (ragContent.includes('{{>_assistant_intro')) {
      console.log(`✓ rag_assistant.prompt correctly references _assistant_intro partial`);
      return true;
    } else {
      console.error(`❌ rag_assistant.prompt does not reference _assistant_intro partial`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Failed to read rag_assistant.prompt: ${error}`);
    return false;
  }
}
