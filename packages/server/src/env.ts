// Load packages/server/.env into process.env before anything reads it.
// Imported first in index.ts so DB_PATH / ADMIN_USERNAMES etc. are available.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to the real environment.
}
