import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors/app-error';
import { hashPassword } from '../../utils/password';
import { ProjectRepository, type PrismaDbClient } from './project.repository';
import type { CreateProjectWithMembersInput } from './project.validation';

const PROJECT_MANAGER_ROLE_SLUG = 'PROJECT_MANAGER';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  PROJECT_MANAGER: ['projects.create'],
  ADMIN: ['projects.create'],
  OWNER: ['projects.create']
};

export type CreateProjectWithMembersResult = {
  projectId: number;
  techUserId: number;
  clientUserId: number;
};

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async assertCanCreateProjects(userId: number): Promise<void> {
    const roleSlugs = await this.repository.getUserRoleSlugs(userId);
    const permissions = new Set<string>();

    for (const roleSlug of roleSlugs) {
      const rolePermissions = ROLE_PERMISSIONS[roleSlug] ?? [];
      for (const permission of rolePermissions) {
        permissions.add(permission);
      }
    }

    if (!permissions.has('projects.create')) {
      throw new ForbiddenError('You do not have permission to create projects');
    }
  }

  async createProjectWithMembers(
    actorUserId: number,
    payload: CreateProjectWithMembersInput
  ): Promise<CreateProjectWithMembersResult> {
    return this.repository.runInTransaction(async (dbClient) => {
      const techTypeId = await this.repository.findUserTypeIdByCode(dbClient, 'TECH');
      const clientTypeId = await this.repository.findUserTypeIdByCode(dbClient, 'CLIENT');

      if (!techTypeId || !clientTypeId) {
        throw new ValidationError('User type catalog is incomplete');
      }

      const projectManagerRole = await this.repository.findTechRoleBySlug(
        dbClient,
        PROJECT_MANAGER_ROLE_SLUG
      );
      if (!projectManagerRole) {
        throw new ValidationError('Tech role PROJECT_MANAGER was not found');
      }

      const techUserId = await this.resolveTechnicalResponsible({
        dbClient,
        techTypeId,
        projectManagerRoleId: projectManagerRole.id,
        techOwner: payload.techOwner
      });

      const clientUserId = await this.resolveStakeholderResponsible({
        dbClient,
        clientTypeId,
        clientOwner: payload.clientOwner
      });

      const projectId = await this.repository.createProject(dbClient, {
        name: payload.project.name,
        description: payload.project.description,
        startDate: payload.project.startDate,
        endDate: payload.project.endDate
      });

      await this.repository.addProjectUser(dbClient, projectId, techUserId);
      await this.repository.addProjectUser(dbClient, projectId, clientUserId);
      await this.repository.addProjectUser(dbClient, projectId, actorUserId);

      return {
        projectId,
        techUserId,
        clientUserId
      };
    });
  }

  private async resolveTechnicalResponsible(args: {
    dbClient: PrismaDbClient;
    techTypeId: number;
    projectManagerRoleId: number;
    techOwner: CreateProjectWithMembersInput['techOwner'];
  }): Promise<number> {
    const { dbClient, techTypeId, projectManagerRoleId, techOwner } = args;

    if (techOwner.mode === 'existing') {
      const existingUser = await this.repository.findUserByIdAndType(
        dbClient,
        techOwner.userId,
        techTypeId
      );

      if (!existingUser) {
        throw new NotFoundError('Technical responsible user was not found');
      }

      const existingRolesCount = await this.repository.countUserTechRoles(dbClient, techOwner.userId);
      if (existingRolesCount === 0) {
        throw new ValidationError('Technical responsible must have at least one role', {
          'techOwner.userId': ['Selected technical user has no technical roles assigned']
        });
      }

      return existingUser.id;
    }

    const duplicateUser = await this.repository.findUserByEmail(dbClient, techOwner.email);
    if (duplicateUser) {
      throw new ConflictError('Technical responsible email is already registered', {
        email: techOwner.email
      });
    }

    const hashedPassword = await hashPassword(techOwner.password);
    const createdUserId = await this.repository.createUser(dbClient, {
      name: techOwner.name,
      email: techOwner.email,
      password: hashedPassword,
      userTypeId: techTypeId
    });

    await this.repository.assignTechRole(dbClient, createdUserId, projectManagerRoleId);

    return createdUserId;
  }

  private async resolveStakeholderResponsible(args: {
    dbClient: PrismaDbClient;
    clientTypeId: number;
    clientOwner: CreateProjectWithMembersInput['clientOwner'];
  }): Promise<number> {
    const { dbClient, clientTypeId, clientOwner } = args;

    if (clientOwner.mode === 'existing') {
      const existingUser = await this.repository.findUserByIdAndType(
        dbClient,
        clientOwner.userId,
        clientTypeId
      );
      if (!existingUser) {
        throw new NotFoundError('Stakeholder user was not found');
      }
      return existingUser.id;
    }

    const duplicateUser = await this.repository.findUserByEmail(dbClient, clientOwner.email);
    if (duplicateUser) {
      throw new ConflictError('Stakeholder email is already registered', {
        email: clientOwner.email
      });
    }

    const roleName = clientOwner.roleName ?? clientOwner.role;
    if (!roleName) {
      throw new ValidationError('Stakeholder role is required', {
        'clientOwner.roleName': ['Role is required for stakeholder creation']
      });
    }

    const createdUserId = await this.repository.createUser(dbClient, {
      name: clientOwner.name,
      email: clientOwner.email,
      password: null,
      userTypeId: clientTypeId
    });

    const existingRoleId = await this.repository.findStakeholderRoleIdByName(dbClient, roleName);
    const stakeholderRoleId = existingRoleId ?? (await this.repository.createStakeholderRole(dbClient, roleName));

    await this.repository.createStakeholderProfile(dbClient, {
      userId: createdUserId,
      stakeholderRoleId,
      companyName: clientOwner.company
    });

    return createdUserId;
  }
}
