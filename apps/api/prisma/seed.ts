import { PrismaClient, OccupancyStatus, ReceiptKind } from '@prisma/client';
import { hash } from 'bcryptjs';
import { toGregorian, jalaaliMonthLength } from 'jalaali-js';

const prisma = new PrismaClient();

function jalaliDate(year: number, month: number, day: number) {
  const g = toGregorian(year, month, day);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

async function ensureCategory(buildingId: string, name: string, parentId?: string) {
  const found = await prisma.expenseCategory.findFirst({
    where: { buildingId, name, parentId: parentId ?? null },
  });
  if (found) {
    return found;
  }
  return prisma.expenseCategory.create({ data: { buildingId, name, parentId } });
}

async function main() {
  const passwordHash = await hash('Admin123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mehr.local' },
    update: { isSuperAdmin: true, name: 'مدیر سیستم' },
    create: {
      email: 'admin@mehr.local',
      passwordHash,
      name: 'مدیر سیستم',
      isSuperAdmin: true,
    },
  });

  const building = await prisma.building.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'برج مهر',
      address: 'تهران',
    },
  });

  await prisma.buildingAccess.upsert({
    where: { userId_buildingId: { userId: admin.id, buildingId: building.id } },
    update: { roles: ['MANAGER'] },
    create: { userId: admin.id, buildingId: building.id, roles: ['MANAGER'] },
  });

  const year = 1404;
  const fiscal = await prisma.fiscalYear.upsert({
    where: { buildingId_title: { buildingId: building.id, title: String(year) } },
    update: {},
    create: {
      buildingId: building.id,
      title: String(year),
      startDate: jalaliDate(year, 1, 1),
      endDate: jalaliDate(year, 12, jalaaliMonthLength(year, 12)),
    },
  });

  const twoBed = await prisma.chargeTariff.upsert({
    where: { buildingId_name: { buildingId: building.id, name: 'دو خوابه' } },
    update: {},
    create: { buildingId: building.id, name: 'دو خوابه', monthlyAmount: 2500000 },
  });
  const threeBed = await prisma.chargeTariff.upsert({
    where: { buildingId_name: { buildingId: building.id, name: 'سه خوابه' } },
    update: {},
    create: { buildingId: building.id, name: 'سه خوابه', monthlyAmount: 3500000 },
  });
  const vacant = await prisma.chargeTariff.upsert({
    where: { buildingId_name: { buildingId: building.id, name: 'واحد خالی' } },
    update: {},
    create: { buildingId: building.id, name: 'واحد خالی', monthlyAmount: 1500000 },
  });

  const units = [
    { number: '101', floor: 1, bedrooms: 2, tariffId: twoBed.id, ownerName: 'احمدی', occupancy: OccupancyStatus.OCCUPIED },
    { number: '102', floor: 1, bedrooms: 3, tariffId: threeBed.id, ownerName: 'محمدی', occupancy: OccupancyStatus.OCCUPIED },
    { number: '201', floor: 2, bedrooms: 2, tariffId: vacant.id, ownerName: 'رضایی', occupancy: OccupancyStatus.VACANT },
    { number: '202', floor: 2, bedrooms: 3, tariffId: threeBed.id, ownerName: 'کریمی', occupancy: OccupancyStatus.OCCUPIED },
  ];
  for (const unit of units) {
    await prisma.unit.upsert({
      where: { buildingId_number: { buildingId: building.id, number: unit.number } },
      update: {},
      create: { buildingId: building.id, ...unit },
    });
  }

  const receiptTypes = [
    { name: 'شارژ', kind: ReceiptKind.CHARGE, isSystem: true },
    { name: 'ورودی', kind: ReceiptKind.ENTRANCE, isSystem: true },
    { name: 'سایر', kind: ReceiptKind.OTHER, isSystem: true },
  ];
  for (const type of receiptTypes) {
    await prisma.receiptType.upsert({
      where: { buildingId_name: { buildingId: building.id, name: type.name } },
      update: {},
      create: { buildingId: building.id, ...type },
    });
  }

  const bills = await ensureCategory(building.id, 'قبوض');
  for (const name of ['آب', 'برق', 'گاز']) {
    await ensureCategory(building.id, name, bills.id);
  }
  for (const name of ['حقوق نگهبان', 'تعمیرات']) {
    await ensureCategory(building.id, name);
  }

  await prisma.backupSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  console.log('Seed OK');
  console.log('Login: admin@mehr.local / Admin123!');
  console.log(`Building: ${building.name} / Fiscal year: ${fiscal.title}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
