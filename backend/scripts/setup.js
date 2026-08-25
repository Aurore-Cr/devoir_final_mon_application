#!/usr/bin/env node
"use strict";
require("dotenv").config();
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ENV = path.join(__dirname, "../.env");

console.log("\n  JAMES — Setup\n");
let env = {};
if (fs.existsSync(ENV)) {
  fs.readFileSync(ENV, "utf8")
    .split("\n")
    .forEach((line) => {
      const eq = line.indexOf("=");
      if (eq > 0 && !line.startsWith("#"))
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    });
}

if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  const k = webpush.generateVAPIDKeys();
  env.VAPID_PUBLIC_KEY = k.publicKey;
  env.VAPID_PRIVATE_KEY = k.privateKey;
  console.log("  ✅ Clés VAPID générées");
} else {
  console.log("  ✅ Clés VAPID conservées");
}

if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
  env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
  console.log("  ✅ JWT_SECRET généré");
}

fs.writeFileSync(
  ENV,
  [
    "# JARVIS .env — NE PAS COMMITTER",
    "NODE_ENV=" + (env.NODE_ENV || "production"),
    "PORT=" + (env.PORT || "3000"),
    "",
    "# Authentification JWT",
    "JWT_SECRET=" + env.JWT_SECRET,
    "",
    "# Notifications push iOS",
    "VAPID_PUBLIC_KEY=" + env.VAPID_PUBLIC_KEY,
    "VAPID_PRIVATE_KEY=" + env.VAPID_PRIVATE_KEY,
    "VAPID_EMAIL=" + (env.VAPID_EMAIL || "mailto:admin@jarvis.local"),
    "",
    "# Google Gemini — https://aistudio.google.com",
    "AI_PROVIDER=gemini",
    "GEMINI_API_KEY=" + (env.GEMINI_API_KEY || ""),
    "GEMINI_MODEL=" + (env.GEMINI_MODEL || "gemini-1.5-flash"),
  ].join("\n") + "\n",
);

console.log("\n  .env mis à jour !");
if (!env.GEMINI_API_KEY) {
  console.log("\n  ⚠️  GEMINI_API_KEY manquante !");
  console.log("  → https://aistudio.google.com → Get API key → Create API key");
  console.log("  → Ajouter dans .env : GEMINI_API_KEY=AIzaSy...");
}
console.log("\n  npm install && npm start\n");
