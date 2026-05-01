import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

const config: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [`${__dirname}/**/domain/*.entity.{ts,js}`],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  migrationsTableName: 'opentrattos_migrations',
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

export default new DataSource(config);
