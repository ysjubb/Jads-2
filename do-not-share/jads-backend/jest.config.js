/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  roots:           ['<rootDir>/src/__tests__'],
  testMatch:       ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globals: {
    'ts-jest': {
      tsconfig: {
        strict:         true,
        esModuleInterop: true,
        skipLibCheck:    true,
      }
    }
  }
}
