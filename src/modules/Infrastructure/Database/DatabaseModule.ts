import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DatabaseOperationExecutor } from "./Service/DatabaseOperationExecutor.js";

import type { DynamicModule } from "@nestjs/common";
import type { TypeOrmModuleAsyncOptions } from "@nestjs/typeorm";

@Module({})
export class DatabaseModule {
  static forRootAsync(options: TypeOrmModuleAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [TypeOrmModule.forRootAsync(options)],
      providers: [DatabaseOperationExecutor],
      exports: [DatabaseOperationExecutor],
      global: true,
    };
  }
}
