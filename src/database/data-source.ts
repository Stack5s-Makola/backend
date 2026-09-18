import { config } from 'dotenv';

config({ quiet: true });
import { DataSource } from 'typeorm';

/**
 * DataSource used by the TypeORM CLI for migrations.
 *
 * The running application configures its own connection in DatabaseModule;
 * this file exists so `npm run migration:*` can reach the same database.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // TypeORM drops the URL query string, so Neon's sslmode=require is lost
  ssl: { rejectUnauthorized: false },
  // Neon wakes a suspended compute on first connect; give it room
  connectTimeoutMS: 20000,
  extra: { connectionTimeoutMillis: 20000 },
  entities: ['src/**/*.entity.ts', 'src/**/*.entities.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
