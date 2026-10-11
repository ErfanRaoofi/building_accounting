import { OccupancyStatus } from '@prisma/client';
import { money } from '../common/jalali';

/** 900,000 toman. Amounts are stored in rial and shown divided by 10. */
export const DEFAULT_VACANT_MONTHLY_CHARGE = 9_000_000;

type RatedUnit = {
  occupancy?: OccupancyStatus;
  customMonthlyCharge: { toString(): string } | null;
  tariff?: { monthlyAmount: { toString(): string } } | null;
};

export function occupiedMonthlyCharge(unit: RatedUnit) {
  if (unit.customMonthlyCharge != null) {
    return money(unit.customMonthlyCharge);
  }
  if (unit.tariff) {
    return money(unit.tariff.monthlyAmount);
  }
  return 0;
}

export function monthlyChargeFor(unit: RatedUnit, occupancy: OccupancyStatus, vacantMonthlyCharge: number) {
  if (occupancy === OccupancyStatus.VACANT) {
    return vacantMonthlyCharge > 0 ? vacantMonthlyCharge : DEFAULT_VACANT_MONTHLY_CHARGE;
  }
  return occupiedMonthlyCharge(unit);
}
