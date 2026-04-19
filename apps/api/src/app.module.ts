import { Module } from '@nestjs/common';
import { IngredientsModule } from './ingredients/ingredients.module';

@Module({
  imports: [
    // Bounded Context: Module 1 — Foundation
    IngredientsModule,

    // Future Bounded Contexts:
    // CostingModule,     // M2 — Recipes & Escandallos
    // HaccpModule,       // M3 — HACCP / APPCC
    // OperationsModule,  // M4 — Inventory & Orders
  ],
})
export class AppModule {}
