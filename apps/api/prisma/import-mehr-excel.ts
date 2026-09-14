import { ChargeInvoiceStatus, OccupancyStatus, PaymentMethod, PrismaClient, ReceiptKind } from '@prisma/client';
import { hash } from 'bcryptjs';
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
  },
});

const YEAR = 1405;
const BUILDING_ID = '00000000-0000-4000-8000-000000000001';
const todayJ = toJalaali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
const currentMonth = todayJ.jy > YEAR ? 12 : todayJ.jy < YEAR ? 1 : todayJ.jm;

type ExcelUnit = {
  number: string;
  bedrooms: number;
  vacant: boolean;
  charge: number;
  paid: number[];
  extra?: boolean;
};

const units: ExcelUnit[] = [
  { number: '1', bedrooms: 2, vacant: true, charge: 11_000_000, paid: [1, 2, 3] },
  { number: '2', bedrooms: 2, vacant: true, charge: 11_000_000, paid: [1, 2] },
  { number: '3', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3] },
  { number: '4', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5] },
  { number: '5', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '6', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3, 4] },
  { number: '7', bedrooms: 2, vacant: true, charge: 11_000_000, paid: [1, 2, 3] },
  { number: '8', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4] },
  { number: '9', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2] },
  { number: '10', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { number: '11', bedrooms: 3, vacant: true, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '12', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3] },
  { number: '13', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3, 4] },
  { number: '14', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2] },
  { number: '15', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '16', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3] },
  { number: '17', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '18', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [] },
  { number: '19', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [] },
  { number: '20', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3] },
  { number: '21', bedrooms: 3, vacant: true, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '22', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '23', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '24', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2] },
  { number: '25', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '26', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3] },
  { number: '27', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '28', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5], extra: true },
  { number: '29', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2] },
  { number: '30', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '31', bedrooms: 2, vacant: false, charge: 11_000_000, paid: [1, 2, 3] },
  { number: '32', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4] },
  { number: '33', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4] },
  { number: '34', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2] },
  { number: '35', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4, 5, 6] },
  { number: '36', bedrooms: 3, vacant: false, charge: 12_000_000, paid: [1, 2, 3, 4] },
];

function jalaliDate(year: number, month: number, day: number) {
  const g = toGregorian(year, month, day);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
}

async function wipeAll() {
  await prisma.receipt.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.chargeInvoice.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.expenseCategory.deleteMany({ where: { parentId: { not: null } } });
  await prisma.expenseCategory.deleteMany();
  await prisma.receiptType.deleteMany();
  await prisma.fiscalYear.deleteMany();
  await prisma.chargeTariff.deleteMany();
  await prisma.signupRequest.deleteMany();
  await prisma.unitResident.deleteMany();
  await prisma.buildingAccess.deleteMany();
  await prisma.building.deleteMany();
  await prisma.user.deleteMany({ where: { email: { not: 'admin@mehr.local' } } });
}

async function ensureCategory(buildingId: string, name: string, parentId?: string) {
  return prisma.expenseCategory.create({ data: { buildingId, name, parentId } });
}

async function main() {
  console.log(`Wiping previous data, then importing Mehr Excel for ${YEAR} (issued through month ${currentMonth})`);
  await wipeAll();

  const passwordHash = await hash('Admin123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mehr.local' },
    update: { passwordHash, name: 'مدیر سیستم', isSuperAdmin: true, isActive: true },
    create: { email: 'admin@mehr.local', passwordHash, name: 'مدیر سیستم', isSuperAdmin: true },
  });

  const building = await prisma.building.create({
    data: { id: BUILDING_ID, name: 'برج مهر', address: 'تهران' },
  });
  await prisma.buildingAccess.create({
    data: { userId: admin.id, buildingId: building.id, roles: ['MANAGER'] },
  });

  const twoBed = await prisma.chargeTariff.create({
    data: { buildingId: building.id, name: 'دو خوابه', monthlyAmount: 11_000_000 },
  });
  const threeBed = await prisma.chargeTariff.create({
    data: { buildingId: building.id, name: 'سه خوابه', monthlyAmount: 12_000_000 },
  });

  const fiscal = await prisma.fiscalYear.create({
    data: {
      buildingId: building.id,
      title: String(YEAR),
      startDate: jalaliDate(YEAR, 1, 1),
      endDate: jalaliDate(YEAR, 12, jalaaliMonthLength(YEAR, 12)),
      status: 'OPEN',
    },
  });

  const chargeType = await prisma.receiptType.create({
    data: { buildingId: building.id, name: 'شارژ', kind: ReceiptKind.CHARGE, isSystem: true },
  });
  await prisma.receiptType.create({
    data: { buildingId: building.id, name: 'ورودی', kind: ReceiptKind.ENTRANCE, isSystem: true },
  });
  const extraType = await prisma.receiptType.create({
    data: { buildingId: building.id, name: 'شارژ متفرقه', kind: ReceiptKind.OTHER, isSystem: false },
  });

  const bills = await ensureCategory(building.id, 'قبوض');
  for (const name of ['آب', 'برق', 'گاز']) {
    await ensureCategory(building.id, name, bills.id);
  }
  for (const name of ['حقوق نگهبان', 'تعمیرات']) {
    await ensureCategory(building.id, name);
  }

  const createdUnits = [];
  for (const row of units) {
    const unit = await prisma.unit.create({
      data: {
        buildingId: building.id,
        number: row.number,
        bedrooms: row.bedrooms,
        occupancy: row.vacant ? OccupancyStatus.VACANT : OccupancyStatus.OCCUPIED,
        tariffId: row.bedrooms === 2 ? twoBed.id : threeBed.id,
        customMonthlyCharge: row.charge,
      },
    });
    createdUnits.push({ unit, row });
  }

  const invoiceRows = createdUnits.flatMap(({ unit, row }) => {
    const lastIssued = Math.max(currentMonth, ...row.paid, 0);
    return Array.from({ length: lastIssued }, (_, i) => {
      const month = i + 1;
      const paid = row.paid.includes(month);
      return {
        unitId: unit.id,
        fiscalYearId: fiscal.id,
        jalaliYear: YEAR,
        jalaliMonth: month,
        amount: row.charge,
        paidAmount: paid ? row.charge : 0,
        status: paid ? ChargeInvoiceStatus.PAID : ChargeInvoiceStatus.UNPAID,
      };
    });
  });
  await prisma.chargeInvoice.createMany({ data: invoiceRows });

  const invoices = await prisma.chargeInvoice.findMany({ where: { fiscalYearId: fiscal.id } });
  let receiptSeq = 0;
  let paidMonthCount = 0;
  let unpaidMonthCount = 0;

  for (const { unit, row } of createdUnits) {
    const unitInvoices = invoices.filter((inv) => inv.unitId === unit.id);
    paidMonthCount += unitInvoices.filter((inv) => inv.status === ChargeInvoiceStatus.PAID).length;
    unpaidMonthCount += unitInvoices.filter((inv) => inv.status === ChargeInvoiceStatus.UNPAID).length;
    if (!row.paid.length) {
      continue;
    }
    const paidInvoices = unitInvoices.filter((inv) => row.paid.includes(inv.jalaliMonth));
    const lastMonth = Math.max(...row.paid);
    receiptSeq += 1;
    const totalAmount = paidInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    await prisma.receipt.create({
      data: {
        buildingId: building.id,
        fiscalYearId: fiscal.id,
        receiptTypeId: chargeType.id,
        unitId: unit.id,
        number: `R-${YEAR}-${String(receiptSeq).padStart(4, '0')}`,
        date: jalaliDate(YEAR, lastMonth, jalaaliMonthLength(YEAR, lastMonth)),
        totalAmount,
        paymentMethod: PaymentMethod.CASH,
        description: 'ورود از اکسل وضعیت شارژ',
        createdById: admin.id,
        lines: {
          create: paidInvoices.map((inv) => ({
            chargeInvoiceId: inv.id,
            amount: inv.amount,
          })),
        },
      },
    });
    if (row.extra) {
      receiptSeq += 1;
      await prisma.receipt.create({
        data: {
          buildingId: building.id,
          fiscalYearId: fiscal.id,
          receiptTypeId: extraType.id,
          unitId: unit.id,
          number: `R-${YEAR}-${String(receiptSeq).padStart(4, '0')}`,
          date: jalaliDate(YEAR, Math.min(lastMonth, currentMonth), 1),
          totalAmount: row.charge,
          paymentMethod: PaymentMethod.CASH,
          description: 'شارژ متفرقه از اکسل (مبلغ در فایل نبود؛ برابر شارژ ماهانه)',
          createdById: admin.id,
          lines: { create: [{ amount: row.charge, description: 'شارژ متفرقه' }] },
        },
      });
    }
  }

  const vacant = units.filter((u) => u.vacant).map((u) => u.number).join(', ');
  const debtors = createdUnits.filter(({ unit }) =>
    invoices.some((inv) => inv.unitId === unit.id && inv.status === ChargeInvoiceStatus.UNPAID),
  ).length;
  console.log(`Building: ${building.name}`);
  console.log(`Units: ${createdUnits.length} (vacant: ${vacant})`);
  console.log(`Invoices: ${invoiceRows.length} (paid months: ${paidMonthCount}, unpaid months: ${unpaidMonthCount})`);
  console.log(`Receipts: ${receiptSeq}`);
  console.log(`Units with remaining debt in issued months: ${debtors}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
