import { effect, untracked } from '@angular/core';
import { ContextService } from './context.service';

export function watchBuilding(ctx: ContextService, reload: () => void) {
  effect(() => {
    const buildingId = ctx.buildingId();
    untracked(() => {
      if (buildingId) {
        reload();
      }
    });
  });
}

export function watchBuildingYear(ctx: ContextService, reload: () => void) {
  effect(() => {
    const buildingId = ctx.buildingId();
    const fiscalYearId = ctx.fiscalYearId();
    untracked(() => {
      if (buildingId && fiscalYearId) {
        reload();
      }
    });
  });
}
