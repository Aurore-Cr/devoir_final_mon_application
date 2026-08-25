"use strict";

// ============================================================
//  JAMES — routes/anglais.js
//  Routes :
//    GET /api/anglais                → tous les exercices (méta seulement)
//    GET /api/anglais/random         → exercice aléatoire complet
//    GET /api/anglais/random?category=Architecture Web
//    GET /api/anglais/random?difficulty=C1
//    GET /api/anglais/random?exclude=ex_001,ex_003  (anti-répétition)
//    GET /api/anglais/:id            → exercice complet par id
//    GET /api/anglais/categories     → liste des catégories disponibles
// ============================================================

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

// Chargement unique au démarrage (le fichier ne change pas en prod)
const DATA_PATH = path.join(__dirname, "../data/anglais_examen.json");
let exercises = [];

try {
  exercises = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  console.log(`[Anglais] ✅ ${exercises.length} exercices chargés`);
} catch (err) {
  console.error(
    "[Anglais] ❌ Impossible de lire anglais_examen.json :",
    err.message,
  );
}

// ─── GET /api/anglais/categories ─────────────────────────
router.get("/categories", (_req, res) => {
  const categories = [...new Set(exercises.map((e) => e.category))].sort();
  const difficulties = [...new Set(exercises.map((e) => e.difficulty))].sort();
  res.json({
    success: true,
    categories,
    difficulties,
    total: exercises.length,
  });
});

// ─── GET /api/anglais/random ──────────────────────────────
router.get("/random", (req, res) => {
  let pool = [...exercises];

  // Filtres optionnels
  if (req.query.category) {
    pool = pool.filter(
      (e) => e.category.toLowerCase() === req.query.category.toLowerCase(),
    );
  }
  if (req.query.difficulty) {
    pool = pool.filter((e) => e.difficulty === req.query.difficulty);
  }

  // Anti-répétition : exclure les IDs déjà vus cette session
  if (req.query.exclude) {
    const seen = req.query.exclude.split(",").map((s) => s.trim());
    const filtered = pool.filter((e) => !seen.includes(e.id));
    // Si tous ont été vus, on repart de zéro (cycle complet)
    if (filtered.length > 0) pool = filtered;
  }

  if (!pool.length) {
    return res
      .status(404)
      .json({
        success: false,
        error: "Aucun exercice correspondant aux critères.",
      });
  }

  const exercise = pool[Math.floor(Math.random() * pool.length)];
  res.json({ success: true, exercise });
});

// ─── GET /api/anglais ─────────────────────────────────────
// Retourne uniquement les méta-données (pas les corrigés) pour le catalogue
router.get("/", (_req, res) => {
  const meta = exercises.map(({ id, category, difficulty, title, intro }) => ({
    id,
    category,
    difficulty,
    title,
    intro,
  }));
  res.json({ success: true, total: exercises.length, exercises: meta });
});

// ─── GET /api/anglais/:id ─────────────────────────────────
router.get("/:id", (req, res) => {
  const exercise = exercises.find((e) => e.id === req.params.id);
  if (!exercise) {
    return res
      .status(404)
      .json({
        success: false,
        error: `Exercice '${req.params.id}' introuvable.`,
      });
  }
  res.json({ success: true, exercise });
});

module.exports = router;
