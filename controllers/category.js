import {validationResult} from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Category from '../models/Category.js';
import {uploadFile} from '../utils/uploadFile.js';

const sanitizeCategory = (category) => ({
  id: category._id,
  name: category.name,
  image: category.image,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

export const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { name } = req.body;

    const exists = await Category.findOne({ name: name.trim() });
    if (exists) {
      return res.status(409).json({ success: false, message: 'Category name already exists' });
    }

    let imageUrl = req.body.image;
    if (!imageUrl) {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, message: 'Image is required' });
      }
      imageUrl = await uploadFile(req.file.buffer);
    }

    const created = await Category.create({ name: name.trim(), image: imageUrl });
    return res.status(201).json({ 
      success: true, 
      message: 'Category created successfully',
      data: {
        category: sanitizeCategory(created)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listCategories = async (_req, res) => {
  try {
    const items = await Category.find().sort({ createdAt: -1 });
    return res.json({ 
      success: true, 
      message: 'Categories retrieved successfully',
      data: items.map(sanitizeCategory)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    return res.json({ 
      success: true, 
      message: 'Category retrieved successfully',
      data: {
        category: sanitizeCategory(category)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const { name } = req.body;
    if (name) {
      const exists = await Category.exists({ _id: { $ne: id }, name: name.trim() });
      if (exists) {
        return res.status(409).json({ success: false, message: 'Category name already exists' });
      }
      category.name = name.trim();
    }

    if (req.file && req.file.buffer) {
      category.image = await uploadFile(req.file.buffer);
    } else if (req.body.image) {
      category.image = req.body.image;
    }

    const updated = await category.save();
    return res.json({ 
      success: true, 
      message: 'Category updated successfully',
      data: {
        category: sanitizeCategory(updated)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    return res.json({ 
      success: true, 
      message: 'Category deleted successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


