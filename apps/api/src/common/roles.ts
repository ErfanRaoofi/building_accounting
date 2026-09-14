import { BuildingRole } from '@prisma/client';

export const STAFF_ROLES: BuildingRole[] = [BuildingRole.MANAGER, BuildingRole.ACCOUNTANT];
export const REPORT_ROLES: BuildingRole[] = [BuildingRole.MANAGER, BuildingRole.ACCOUNTANT, BuildingRole.BOARD];
export const MANAGER_ROLES: BuildingRole[] = [BuildingRole.MANAGER];
export const RESIDENT_ROLES: BuildingRole[] = [BuildingRole.RESIDENT];
export const ASSIGNABLE_BY_MANAGER: BuildingRole[] = [
  BuildingRole.ACCOUNTANT,
  BuildingRole.BOARD,
  BuildingRole.RESIDENT,
];
export const ALL_BUILDING_ROLES: BuildingRole[] = [
  BuildingRole.MANAGER,
  BuildingRole.ACCOUNTANT,
  BuildingRole.BOARD,
  BuildingRole.RESIDENT,
];

export function uniqueRoles(roles: BuildingRole[]) {
  return [...new Set(roles)];
}
