import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { DatabaseOptionsModule } from "./modules/App/DatabaseOptionsModule.js";
import { DatabaseOptionsFactory } from "./modules/App/Factory/DatabaseOptionsFactory.js";

const app = await NestFactory.createApplicationContext(DatabaseOptionsModule, {
  logger: false,
  abortOnError: false,
});

let dataSource: DataSource;

try {
  dataSource = new DataSource(app.get(DatabaseOptionsFactory).createTypeOrmOptions());
} finally {
  await app.close();
}

export default dataSource;
