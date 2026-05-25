import express from "express";
import { cropydealsRegisterLogin } from "../controllers/registerLogin.controller.js";

const router = express.Router();

router.post("/cropydeal-register-login", cropydealsRegisterLogin);

export default router;
