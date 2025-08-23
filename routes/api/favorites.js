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

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Add star to favorites
router.post('/add', addToFavoritesValidator, addToFavorites);

// Remove star from favorites
router.post('/remove', removeFromFavoritesValidator, removeFromFavorites);

// Toggle favorite status (recommended for frontend toggle functionality)
router.post('/toggle', toggleFavoriteValidator, toggleFavorite);

// Get user's favorites list
router.get('/', getFavorites);

export default router;
