#!/bin/sh
# Run inside building-accounting-backend (no npm install needed):
#   sh seed-admin-in-container.sh
# Or paste the node -e block from the README / chat into Portainer Console.

node <<'EOF'
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const { toGregorian, jalaaliMonthLength } = require('jalaali-js');

function jalaliDate(year, month, day) {
  const g = toGregorian(year, month, day);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

(async () => {
  const prisma = new PrismaClient();
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

  console.log('OK', admin.email, 'Admin123!', 'FY', fiscal.title);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
EOF
