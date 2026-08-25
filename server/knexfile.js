import 'dotenv/config';

const databaseConfig = {
  client: 'mysql2',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './knex/migrations',
    tableName: 'knex_migrations'
  }
};

export default {
  development: databaseConfig,
  production: databaseConfig
};
