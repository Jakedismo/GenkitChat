#!/usr/bin/env node
// test-prompts.js - Test script to validate prompt loading

const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Prompt Directory Resolution...\n');

// Test the same logic used in genkit-server.ts
const promptDirPath = path.join(process.cwd(), "src/ai/prompts");
console.log(`📁 Current working directory: ${process.cwd()}`);
console.log(`📁 Resolved prompt directory: ${promptDirPath}`);

// Check if directory exists
if (fs.existsSync(promptDirPath)) {
  console.log('✅ Prompt directory exists');
  
  const files = fs.readdirSync(promptDirPath);
  const promptFiles = files.filter(f => f.endsWith('.prompt'));
  const partialFiles = files.filter(f => f.startsWith('_') && f.endsWith('.prompt'));
  
  console.log(`\n📋 Found Files:`);
  console.log(`   - Total prompt files: ${promptFiles.length}`);
  console.log(`   - Partial files: ${partialFiles.length}`);
  
  console.log(`\n📄 Prompt Files:`);
  promptFiles.forEach(file => console.log(`   - ${file}`));
  
  console.log(`\n🧩 Partial Files:`);
  partialFiles.forEach(file => console.log(`   - ${file}`));
  
  // Specifically check for _assistant_intro.prompt
  const assistantIntroExists = partialFiles.includes('_assistant_intro.prompt');
  console.log(`\n🔍 _assistant_intro.prompt exists: ${assistantIntroExists ? '✅ YES' : '❌ NO'}`);
  
  // Check rag_assistant.prompt references
  const ragAssistantPath = path.join(promptDirPath, 'rag_assistant.prompt');
  if (fs.existsSync(ragAssistantPath)) {
    const content = fs.readFileSync(ragAssistantPath, 'utf8');
    const hasAssistantIntroRef = content.includes('{{>_assistant_intro');
    console.log(`🔍 rag_assistant.prompt references _assistant_intro: ${hasAssistantIntroRef ? '✅ YES' : '❌ NO'}`);
    
    if (hasAssistantIntroRef) {
      const matches = content.match(/\{\{>_assistant_intro[^}]*\}\}/g);
      console.log(`📝 Reference found: ${matches ? matches[0] : 'None'}`);
    }
  }
  
  console.log('\n✅ Directory validation complete!');
} else {
  console.log('❌ Prompt directory does not exist');
  console.log('🔧 Possible solutions:');
  console.log('   1. Check your current working directory');
  console.log('   2. Ensure the project structure is correct');
  console.log('   3. Verify the path in genkit-server.ts');
}

console.log('\n🏁 Test complete. Check the output above for any issues.');
