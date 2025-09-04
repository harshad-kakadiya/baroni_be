import {getAllStars, getStarById, becomeStar, getBaroniIdPatterns} from "../../controllers/star.js";
import express from "express";
import {requireAuth} from "../../middlewares/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", getAllStars);
router.get("/patterns", getBaroniIdPatterns);
router.get("/:id", getStarById);
router.post("/become", becomeStar);

export default router;