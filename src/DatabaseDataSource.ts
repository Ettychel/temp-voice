import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { DatabaseOptionsFactory } from "./modules/App/Factory/DatabaseOptionsFactory.js";
import { CliModule } from "./modules/Cli/CliModule.js";

const app = await NestFactory.createApplicationContext(CliModule, {
  logger: false,
  abortOnError: false,
});

let dataSource: DataSource;

try {
  dataSource = new DataSource({
    ...app.get(DatabaseOptionsFactory).createTypeOrmOptions(),
    migrationsRun: false,
  });
} finally {
  await app.close();
}

export default dataSource;
