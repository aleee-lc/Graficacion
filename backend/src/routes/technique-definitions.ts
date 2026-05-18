import { Router } from 'express';
import { TECHNIQUE_DEFINITIONS } from '../lib/technique-definitions';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
  res.json({ techniques: TECHNIQUE_DEFINITIONS });
});

export default router;
