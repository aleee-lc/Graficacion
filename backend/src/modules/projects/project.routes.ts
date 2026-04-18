import { Router, type NextFunction, type Response } from 'express';
import { UnauthorizedError } from '../../core/errors/app-error';
import { requireAuth, type AuthRequest } from '../../middleware/auth';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';

const router = Router();
const projectRepository = new ProjectRepository();
const projectService = new ProjectService(projectRepository);
const projectController = new ProjectController(projectService);

const requireCreateProjectPermission = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    await projectService.assertCanCreateProjects(actorUserId);
    next();
  } catch (error) {
    next(error);
  }
};

router.post('/wizard', requireAuth, requireCreateProjectPermission, projectController.createProjectWithMembers);

export default router;
