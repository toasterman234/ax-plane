import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from './load-env';
import * as schema from './schema';

loadEnv();

export function makeDatabase(url = process.env.DATABASE_URL ?? 'postgres://axplane:axplane@localhost:5433/axplane') {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof makeDatabase>['db'];
