// knexfile.js
require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'dev',
      charset: 'utf8mb4'
    },
    migrations: {
      directory: './knex-migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './knex-seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      charset: 'utf8mb4'
    },
    migrations: {
      directory: './knex-migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './knex-seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  staging: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      charset: 'utf8mb4'
    },
    migrations: {
      directory: './knex-migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './knex-seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};
