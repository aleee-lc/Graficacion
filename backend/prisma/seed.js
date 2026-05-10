const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const USER_TYPES = [
  { id: 1, code: 'TECH' },
  { id: 2, code: 'CLIENT' }
];

const TECH_ROLES = ['Developer', 'QA', 'UX', 'DevOps'];
const STAKEHOLDER_ROLES = ['Product Owner', 'Business Sponsor', 'Operations'];

async function seedUserTypes() {
  for (const userType of USER_TYPES) {
    await prisma.userType.upsert({
      where: { code: userType.code },
      update: {},
      create: userType
    });
  }
}

async function seedTechRoles() {
  for (const roleName of TECH_ROLES) {
    const normalized = roleName.trim();
    const existing = await prisma.techRole.findFirst({
      where: {
        name: {
          equals: normalized,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });

    if (!existing) {
      await prisma.techRole.create({
        data: { name: normalized }
      });
    }
  }
}

async function seedStakeholderRoles() {
  for (const roleName of STAKEHOLDER_ROLES) {
    const normalized = roleName.trim();
    const existing = await prisma.stakeholderRole.findFirst({
      where: {
        name: {
          equals: normalized,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });

    if (!existing) {
      await prisma.stakeholderRole.create({
        data: { name: normalized }
      });
    }
  }
}

async function main() {
  await seedUserTypes();
  await seedTechRoles();
  await seedStakeholderRoles();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Prisma seed completed');
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error('Prisma seed failed');
    console.error(error);
    process.exit(1);
  });
