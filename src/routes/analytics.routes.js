import express from 'express';
import { getDashboardAnalytics} from '../controllers/analytics/analytics.controller.js';
import { clientPing } from '../controllers/analytics/clientping.controller.js';
import { isAuthenticated } from '../middleware/auth.middleware.js';
import { updateUserActivity } from '../middleware/update.user.activity.middleware.js';

const router = express.Router();

router.get('/', getDashboardAnalytics);
router.post('/ping',isAuthenticated,updateUserActivity,clientPing);

export default router;