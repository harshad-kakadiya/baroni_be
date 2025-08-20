import {getAllStars, getStarById} from "../../controllers/star.js";
import express from "express";

const router = express.Router();

router.get("/", getAllStars);
router.get("/:id", getStarById);

export default router;