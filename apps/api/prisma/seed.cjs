/**
 * Production seed without tsx/npm install.
 * Run inside backend container:
 *   node prisma/seed.cjs
 */
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const { toGregorian, jalaaliMonthLength } = require('jalaali-js');

const prisma = new PrismaClient();

function jalaliDate(year, month, day) {
  const g = toGregorian(year, month, day);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

async function main() {
  const passwordHash = await hash('Admin123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mehr.local' },
    update: { isSuperAdmin: true, name: 'مدیر سیستم', passwordHash },
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

  for (const type of [
    { name: 'شارژ', kind: 'CHARGE', isSystem: true },
    { name: 'ورودی', kind: 'ENTRANCE', isSystem: true },
    { name: 'سایر', kind: 'OTHER', isSystem: true },
  ]) {
    await prisma.receiptType.upsert({
      where: { buildingId_name: { buildingId: building.id, name: type.name } },
      update: {},
      create: { buildingId: building.id, ...type },
    });
  }

  await prisma.backupSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  console.log('OK');
  console.log('Login:', admin.email, '/ Admin123!');
  console.log('Building:', building.name);
  console.log('Fiscal year:', fiscal.title);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
