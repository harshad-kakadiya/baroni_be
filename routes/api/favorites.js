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

router.post('/add', addToFavoritesValidator, addToFavorites);
router.post('/remove', removeFromFavoritesValidator, removeFromFavorites);
router.post('/toggle', toggleFavoriteValidator, toggleFavorite);
router.get('/', getFavorites);

export default router;
