import express from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import { createCategory, listCategories, getCategoryById, updateCategory, deleteCategory } from '../../controllers/category.js';
import { createCategoryValidator, updateCategoryValidator, categoryIdValidator } from '../../validators/categoryValidators.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', listCategories);
router.get('/:id', categoryIdValidator, getCategoryById);

router.post('/', upload.single('image'), createCategoryValidator, createCategory);
router.put('/:id', upload.single('image'), updateCategoryValidator, updateCategory);
router.delete('/:id', categoryIdValidator, deleteCategory);

export default router;
















