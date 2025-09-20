import express from 'express';
import {
  addToFavorites,
  removeFromFavorites,
  toggleFavorite,
  getFavorites
} from '../../controllers/favorites.js';
import {
  addToFavoritesValidator,
  removeFromFavoritesValidator,
  toggleFavoriteValidator
} from '../../validators/favoritesValidators.js';
import { requireAuth } from '../../middlewares/auth.js';
import { requireFanRole } from '../../middlewares/roleAuth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Apply fan-only restriction to all favorite routes
router.use(requireFanRole);

router.post('/add', addToFavoritesValidator, addToFavorites);
router.post('/remove', removeFromFavoritesValidator, removeFromFavorites);
router.post('/toggle', toggleFavoriteValidator, toggleFavorite);
router.get('/', getFavorites);

export default router;
