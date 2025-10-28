import 'dotenv/config';

export default {
  development: {
    client: 'mysql2',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './knex/migrations',
      tableName: 'knex_migrations'
    }
  }
};
