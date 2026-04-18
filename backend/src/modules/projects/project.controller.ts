import type { NextFunction, Response } from 'express';
import { UnauthorizedError } from '../../core/errors/app-error';
import type { AuthRequest } from '../../middleware/auth';
import { ProjectService } from './project.service';
import { validateCreateProjectWithMembers } from './project.validation';

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  createProjectWithMembers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorUserId = req.user?.sub;
      if (!actorUserId) {
        throw new UnauthorizedError('Authentication required');
      }

      const payload = validateCreateProjectWithMembers(req.body);
      const result = await this.projectService.createProjectWithMembers(actorUserId, payload);

      res.status(201).json({
        success: true,
        data: result,
        ...result
      });
    } catch (error) {
      next(error);
    }
  };
}
