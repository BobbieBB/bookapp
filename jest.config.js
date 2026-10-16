// App tests run against the local Supabase stack (npm run db:start), never a hosted project.
// .env.local holds its URL and publishable key; CI exports them from `supabase status`.
const fs = require('node:fs');

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

module.exports = {
  preset: 'jest-expo',
  testEnvironment: '<rootDir>/test/environment.js',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/afterEnv.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/supabase/'],
  // App tests talk to a real local Supabase stack, so give them more than the 5 s default.
  testTimeout: 30_000,
};
