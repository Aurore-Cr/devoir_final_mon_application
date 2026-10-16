"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");

const app = express();

const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// =====================================================
// FRONTEND
// =====================================================

// Sert les fichiers du frontend depuis frontend/public
app.use(express.static(path.join(__dirname, "frontend", "public")));

// =====================================================
// API
// =====================================================

app.use("/api", require("./backend/src/routes/api"));
app.use("/api/auth", require("./backend/src/routes/auth"));
app.use("/api/user", require("./backend/src/routes/user"));
app.use("/api/organizer", require("./backend/src/routes/organizer"));
app.use("/api/veille", require("./backend/src/routes/veille"));
app.use("/api/anglais", require("./backend/src/routes/anglais"));
app.use("/api/defis", require("./backend/src/routes/defis"));
app.use("/api/generate", require("./backend/src/routes/generate"));

// =====================================================
// FRONTEND - FALLBACK
// =====================================================

// Pour React / navigation côté client
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "public", "index.html"));
});

// =====================================================
// DÉMARRAGE DU SERVEUR
// =====================================================

async function start() {
  try {
    await require("./backend/src/db/database").initDatabase();

    app.listen(PORT, () => {
      console.log(`\n  ✅ JAMES démarré → http://localhost:${PORT}\n`);
    });

    require("./backend/src/services/veille.service")
      .prefetchReport()
      .catch(() => {});

    require("./backend/src/db/nosql").cleanOldExercises.run();
  } catch (err) {
    console.error("❌ Erreur démarrage:", err.message);
    process.exit(1);
  }
}

// =====================================================
// CRON - VEILLE
// =====================================================

cron.schedule(
  "0 7 * * *",
  () => require("./backend/src/services/veille.service").prefetchReport(),
  {
    timezone: "Europe/Paris",
  },
);

// =====================================================
// CRON - NOTIFICATIONS
// =====================================================

cron.schedule("* * * * *", async () => {
  try {
    await require("./backend/src/services/push.service").checkAndNotify();
    await require("./backend/src/services/organizer-reminders").checkAndNotify();
  } catch {}
});

// =====================================================
// CRON - NETTOYAGE EXERCICES
// =====================================================

cron.schedule("0 3 * * *", () =>
  require("./backend/src/db/nosql").cleanOldExercises.run(),
);

// =====================================================
// START
// =====================================================

start();
