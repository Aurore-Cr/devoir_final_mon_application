"use strict";

// ============================================================
//  JAMES— routes/defis.js
//
//  GET /api/defis                    → catalogue (méta sans solutions)
//  GET /api/defis/stats              → stats du catalogue
//  GET /api/defis/random             → défi aléatoire complet
//    ?techno=React                   → filtre techno
//    ?niveau=Facile                  → filtre niveau
//    ?exclude=defi_001,defi_003      → anti-répétition de session
//  GET /api/defis/:id                → défi complet par id
// ============================================================

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");

const DATA_PATH = path.join(__dirname, "../data/defis_dev.json");
let defis = [];

try {
  defis = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  console.log(`[Défis] ✅ ${defis.length} défis chargés`);
} catch (err) {
  console.error("[Défis] ❌ Lecture defis_dev.json :", err.message);
}

// ─── GET /api/defis/stats ─────────────────────────────────
router.get("/stats", (_req, res) => {
  const technos = [...new Set(defis.map((d) => d.techno))].sort();
  const niveaux = [...new Set(defis.map((d) => d.niveau))];
  const byTechno = technos.map((t) => ({
    techno: t,
    count: defis.filter((d) => d.techno === t).length,
    facile: defis.filter((d) => d.techno === t && d.niveau === "Facile").length,
    moyen: defis.filter((d) => d.techno === t && d.niveau === "Moyen").length,
  }));

  res.json({ success: true, total: defis.length, technos, niveaux, byTechno });
});

// ─── GET /api/defis/random ────────────────────────────────
router.get("/random", (req, res) => {
  let pool = [...defis];

  if (req.query.techno) {
    pool = pool.filter(
      (d) => d.techno.toLowerCase() === req.query.techno.toLowerCase(),
    );
  }
  if (req.query.niveau) {
    pool = pool.filter(
      (d) => d.niveau.toLowerCase() === req.query.niveau.toLowerCase(),
    );
  }
  if (req.query.exclude) {
    const seen = req.query.exclude.split(",").map((s) => s.trim());
    const filtered = pool.filter((d) => !seen.includes(d.id));
    if (filtered.length > 0) pool = filtered; // sinon cycle repart à zéro
  }

  if (!pool.length) {
    return res.status(404).json({
      success: false,
      error: "Aucun défi correspondant aux filtres.",
    });
  }

  const defi = pool[Math.floor(Math.random() * pool.length)];
  res.json({ success: true, defi });
});

// ─── GET /api/defis ───────────────────────────────────────
// Méta seule (pas les solutions) pour le catalogue
router.get("/", (_req, res) => {
  const meta = defis.map(
    ({ id, titre, techno, niveau, tags, duree, objectif }) => ({
      id,
      titre,
      techno,
      niveau,
      tags,
      duree,
      objectif,
    }),
  );
  res.json({ success: true, total: defis.length, defis: meta });
});

// ─── GET /api/defis/:id ───────────────────────────────────
router.get("/:id", (req, res) => {
  const defi = defis.find((d) => d.id === req.params.id);
  if (!defi) {
    return res.status(404).json({
      success: false,
      error: `Défi '${req.params.id}' introuvable.`,
    });
  }
  res.json({ success: true, defi });
});

module.exports = router;
