import { validationResult } from 'express-validator';
import { getFirstValidationError } from '../utils/validationHelper.js';
import Config from '../models/Config.js';

const sanitizeConfig = (cfg) => ({
  id: cfg._id,
  liveShowPriceHide: cfg.liveShowPriceHide,
  videoCallPriceHide: cfg.videoCallPriceHide,
  becomeBaronistarPriceHide: cfg.becomeBaronistarPriceHide,
  isTestUser: cfg.isTestUser,
  createdAt: cfg.createdAt,
  updatedAt: cfg.updatedAt,
});

export const getPublicConfig = async (_req, res) => {
  try {
    const cfg = await Config.getSingleton();
    return res.json({ 
      success: true, 
      data: {
        message: 'Configuration retrieved successfully',
        config: sanitizeConfig(cfg)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const upsertConfig = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessage = getFirstValidationError(errors);
      return res.status(400).json({ success: false, message: errorMessage || 'Validation failed' });
    }

    const cfg = await Config.getSingleton();

    const {
      liveShowPriceHide,
      videoCallPriceHide,
      becomeBaronistarPriceHide,
      isTestUser,
    } = req.body;

    const normalize = (val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
      }
      return undefined;
    };

    const nLiveShow = normalize(liveShowPriceHide);
    const nVideoCall = normalize(videoCallPriceHide);
    const nBecome = normalize(becomeBaronistarPriceHide);
    const nTestUser = normalize(isTestUser);

    if (typeof nLiveShow === 'boolean') cfg.liveShowPriceHide = nLiveShow;
    if (typeof nVideoCall === 'boolean') cfg.videoCallPriceHide = nVideoCall;
    if (typeof nBecome === 'boolean') cfg.becomeBaronistarPriceHide = nBecome;
    if (typeof nTestUser === 'boolean') cfg.isTestUser = nTestUser;

    const saved = await cfg.save();
    return res.json({ 
      success: true, 
      data: {
        message: 'Configuration updated successfully',
        config: sanitizeConfig(saved)
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};



