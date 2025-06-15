// jest.config.js
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  // preset: 'ts-jest', // next/jest handles TypeScript
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    // Mock CSS Modules (if used, otherwise this can be omitted or adjusted)
    // We are using Tailwind, but some components might use CSS modules.
    // Also, this handles global CSS imports in components if any.
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transformIgnorePatterns: [
    // Attempting a more targeted pattern for lucide-react's ESM path
    'node_modules/(?!(lucide-react/dist/esm|react-markdown|devlop|estree-util-is-identifier-name|html-url-attributes|lowlight|remark-.+|rehype-.+|unified|unist-.+|bail|ccount|character-entities|comma-separated-tokens|decode-named-character-reference|hast-.+|is-plain-obj|longest-streak|markdown-table|mdast-.+|micromark.*|property-information|space-separated-tokens|trim-lines|trough|vfile.*|web-namespaces|zwitch|escape-string-regexp)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
