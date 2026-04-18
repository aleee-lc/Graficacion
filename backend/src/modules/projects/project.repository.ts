import { Prisma } from '@prisma/client';
import { ConflictError } from '../../core/errors/app-error';
import { prisma } from '../../lib/prisma';

export type PrismaDbClient = Prisma.TransactionClient | typeof prisma;

export type DatabaseUser = {
  id: number;
  user_type: number | null;
};

export type TechRole = {
  id: number;
  name: string;
};

const normalizeRoleSlug = (value: string) => value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();

export class ProjectRepository {
  async runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => fn(tx));
  }

  async findUserTypeIdByCode(db: PrismaDbClient, code: 'TECH' | 'CLIENT'): Promise<number | null> {
    const result = await db.userType.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true }
    });

    return result?.id ?? null;
  }

  async findUserByEmail(db: PrismaDbClient, email: string): Promise<DatabaseUser | null> {
    const result = await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, userTypeId: true }
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      user_type: result.userTypeId ?? null
    };
  }

  async findUserByIdAndType(
    db: PrismaDbClient,
    userId: number,
    userTypeId: number
  ): Promise<DatabaseUser | null> {
    const result = await db.user.findFirst({
      where: {
        id: userId,
        userTypeId
      },
      select: { id: true, userTypeId: true }
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      user_type: result.userTypeId ?? null
    };
  }

  async createUser(
    db: PrismaDbClient,
    data: { name: string; email: string; password: string | null; userTypeId: number }
  ): Promise<number> {
    try {
      const result = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
          userTypeId: data.userTypeId
        },
        select: { id: true }
      });

      return result.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Email is already registered', { email: data.email });
      }
      throw error;
    }
  }

  async findTechRoleBySlug(db: PrismaDbClient, roleSlug: string): Promise<TechRole | null> {
    const roles = await db.techRole.findMany({
      where: { name: { not: null } },
      select: { id: true, name: true }
    });

    const role = roles.find((item) => normalizeRoleSlug(item.name ?? '') === roleSlug);
    if (!role || !role.name) {
      return null;
    }

    return {
      id: role.id,
      name: role.name
    };
  }

  async assignTechRole(db: PrismaDbClient, userId: number, roleId: number): Promise<void> {
    await db.techUserRole.upsert({
      where: {
        userId_roleId: { userId, roleId }
      },
      update: {},
      create: {
        userId,
        roleId
      }
    });
  }

  async countUserTechRoles(db: PrismaDbClient, userId: number): Promise<number> {
    return db.techUserRole.count({
      where: { userId }
    });
  }

  async findStakeholderRoleIdByName(db: PrismaDbClient, name: string): Promise<number | null> {
    const result = await db.stakeholderRole.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true }
    });
    return result?.id ?? null;
  }

  async createStakeholderRole(db: PrismaDbClient, name: string): Promise<number> {
    const result = await db.stakeholderRole.create({
      data: { name },
      select: { id: true }
    });
    return result.id;
  }

  async createStakeholderProfile(
    db: PrismaDbClient,
    data: { userId: number; stakeholderRoleId: number; companyName: string }
  ): Promise<void> {
    await db.stakeholderProfile.upsert({
      where: {
        userId: data.userId
      },
      update: {
        stakeholderRoleId: data.stakeholderRoleId,
        companyName: data.companyName
      },
      create: {
        userId: data.userId,
        stakeholderRoleId: data.stakeholderRoleId,
        companyName: data.companyName
      }
    });
  }

  async createProject(
    db: PrismaDbClient,
    data: { name: string; description: string; startDate: string; endDate: string }
  ): Promise<number> {
    const result = await db.project.create({
      data: {
        name: data.name,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate)
      },
      select: { id: true }
    });

    return result.id;
  }

  async addProjectUser(db: PrismaDbClient, projectId: number, userId: number): Promise<void> {
    await db.projectUser.upsert({
      where: {
        projectId_userId: { projectId, userId }
      },
      update: {},
      create: {
        projectId,
        userId
      }
    });
  }

  async getUserRoleSlugs(userId: number): Promise<string[]> {
    const rows = await prisma.techUserRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            name: true
          }
        }
      }
    });

    return rows
      .map((row) => row.role.name ?? '')
      .filter((name) => name.length > 0)
      .map((name) => normalizeRoleSlug(name));
  }
}
