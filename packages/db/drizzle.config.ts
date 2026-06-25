import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/load-env';

loadEnv();

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://axplane:axplane@localhost:5433/axplane',
  },
});
