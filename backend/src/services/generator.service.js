"use strict";

const https = require("https");
const nosql = require("../db/nosql");

// =====================================================
// CONFIGURATION GEMINI
// =====================================================

function getKey() {
  return process.env.GEMINI_API_KEY || "";
}

function getModel() {
  return process.env.GEMINI_MODEL || "gemini-3.6-flash";
}

function isConfigured() {
  return !!getKey();
}

function providerLabel() {
  return isConfigured() ? "Google Gemini (gratuit)" : "Non configuré";
}

// =====================================================
// SCHÉMA JSON — DÉFI DE CODE
// =====================================================

const DEFI_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    titre: { type: "string" },
    techno: { type: "string" },
    niveau: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    duree: { type: "string" },
    objectif: { type: "string" },
    enonce: { type: "string" },
    contraintes: { type: "array", items: { type: "string" } },
    ressources: { type: "array", items: { type: "string" } },
    solution: {
      type: "object",
      properties: {
        methodologie: { type: "string" },
        langage: { type: "string" },
        code: { type: "string" },
        explications: { type: "array", items: { type: "string" } },
      },
      required: ["methodologie", "langage", "code", "explications"],
    },
  },
  required: [
    "id",
    "titre",
    "techno",
    "niveau",
    "tags",
    "duree",
    "objectif",
    "enonce",
    "contraintes",
    "ressources",
    "solution",
  ],
};
// =====================================================
// SCHÉMA JSON — EXERCICE ANGLAIS //
// =====================================================

const ANGLAIS_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    category: { type: "string" },
    difficulty: { type: "string" },
    title: { type: "string" },
    intro: { type: "string" },
    text: { type: "string" },
    code: { type: "string" },
    language: { type: "string" },
    translation_challenge: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, question: { type: "string" } },
        required: ["id", "question"],
      },
    },
    model_translation: { type: "string" },
    model_answers: { type: "array", items: { type: "string" } },
    lexicon: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          french: { type: "string" },
          definition: { type: "string" },
        },
        required: ["term", "french", "definition"],
      },
    },
  },
  required: [
    "id",
    "category",
    "difficulty",
    "title",
    "intro",
    "text",
    "code",
    "language",
    "translation_challenge",
    "questions",
    "model_translation",
    "model_answers",
    "lexicon",
  ],
};

// =====================================================
// APPEL GEMINI
// =====================================================

function callGemini(prompt, responseSchema) {
  return new Promise((resolve, reject) => {
    const key = getKey();

    if (!key) {
      reject(new Error("GEMINI_API_KEY manquante dans .env"));
      return;
    }

    const body = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8000,

        // Gemini doit renvoyer du JSON

        responseMimeType: "application/json",

        // Structure JSON imposée

        responseSchema: responseSchema,
      },
    });

    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",

        // API Gemini stable v1
        path:
          "/v1/models/" +
          getModel() +
          ":generateContent?key=" +
          encodeURIComponent(key),

        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },

      (res) => {
        let raw = "";

        res.on("data", (chunk) => {
          raw += chunk;
        });

        res.on("end", () => {
          try {
            const data = JSON.parse(raw);

            // -------------------------------------------------
            //  ERREUR GEMINI
            // -------------------------------------------------

            if (data.error) {
              reject(new Error("Gemini: " + data.error.message));
              return;
            }

            // -------------------------------------------------
            // RÉPONSE GEMINI
            //  -------------------------------------------------

            const candidate = data.candidates?.[0];
            if (!candidate) {
              reject(new Error("Gemini: aucun candidat dans la réponse."));
              return;
            } // -------------------------------------------------
            // RAISON DE FIN
            // -------------------------------------------------

            const finishReason = candidate.finishReason;
            if (finishReason === "MAX_TOKENS") {
              reject(
                new Error(
                  "Gemini: réponse tronquée — limite de tokens atteinte.",
                ),
              );
              return;
            }

            if (finishReason && finishReason !== "STOP") {
              reject(
                new Error(
                  "Gemini: génération interrompue (" + finishReason + ").",
                ),
              );
              return;
            }

            // -------------------------------------------------
            // TEXTE JSON
            // -------------------------------------------------

            const text = candidate.content?.parts
              ?.map((part) => part.text || "")
              .join("");
            if (!text) {
              reject(new Error("Gemini: réponse vide."));
              return;
            }

            // -------------------------------------------------
            //  VALIDATION JSON
            // -------------------------------------------------

            try {
              const parsed = JSON.parse(text);
              resolve(JSON.stringify(parsed));
            } catch (jsonError) {
              reject(
                new Error(
                  "Gemini: JSON invalide malgré le schéma structuré — " +
                    jsonError.message,
                ),
              );
            }
          } catch (error) {
            reject(
              new Error(
                "Gemini: réponse HTTP invalide — " +
                  error.message +
                  " — " +
                  raw.slice(0, 500),
              ),
            );
          }
        });
      },
    );

    // -------------------------------------------------------
    //  TIMEOUT
    // -------------------------------------------------------

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Timeout Gemini : 60 secondes"));
    });

    // -------------------------------------------------------
    //  ERREUR RÉSEAU
    //  -------------------------------------------------------

    req.on("error", (error) => {
      reject(new Error("Réseau Gemini: " + error.message));
    });
    req.write(body);
    req.end();
  });
}

// =====================================================
// EXTRACTION JSON
//  =====================================================

function extractJSON(raw) {
  if (!raw) {
    throw new Error("Réponse vide");
  }
  try {
    return JSON.parse(raw.trim());
  } catch (error) {
    throw new Error("JSON invalide: " + error.message);
  }
}
// =====================================================
//  DONNÉES
// =====================================================

const TECHNOS_DEV = [
  "JavaScript",
  "TypeScript",
  "React",
  "Angular",
  "Vue.js",
  "Express",
  "Node.js",
  "HTML/CSS",
  "MySQL",
  "PHP",
  "Symfony",
  "Git",
  "Docker",
];
const TOPICS_ANGLAIS = [
  "GraphQL API design",
  "Docker containerisation",
  "OAuth 2.0",
  "CSS Grid Layout",
  "SQL Transactions",
  "WebSockets",
  "TypeScript Generics",
  "React Hooks",
  "Microservices",
  "REST API versioning",
  "Progressive Web Apps",
  "Algorithm complexity Big O",
  "Database indexing",
  "SOLID principles",
  "Test-Driven Development",
];
const NIVEAUX = ["Facile", "Moyen", "Difficile"];
const DIFFICULTIES = ["A2", "B1", "B2", "C1"];

// =====================================================
//  CODE LANGUAGE
// /=====================================================

function langCode(techno) {
  return (
    {
      MySQL: "sql",
      PHP: "php",
      "HTML/CSS": "css",
      TypeScript: "typescript",
      React: "jsx",
      Angular: "typescript",
      "Vue.js": "javascript",
      Docker: "bash",
      Git: "bash",
      Symfony: "php",
    }[techno] || "javascript"
  );
}

// =====================================================
// GÉNÉRATION D'UN DÉFI
// =====================================================

async function generateDefi(techno, niveau) {
  const t =
    techno || TECHNOS_DEV[Math.floor(Math.random() * TECHNOS_DEV.length)];
  const n = niveau || NIVEAUX[Math.floor(Math.random() * NIVEAUX.length)];

  // -------------------------------------------------------
  // CACHE
  // -------------------------------------------------------

  const cached = nosql.find(
    { type: "defi", techno: t, niveau: n },
    { maxAgeHours: 24 },
  );
  if (cached.length > 0) {
    console.log("[Generator] Cache NoSQL — défi", t, n);
    return cached[Math.floor(Math.random() * cached.length)].content;
  }

  // -------------------------------------------------------
  // GEMINI
  //  -------------------------------------------------------

  console.log("[Generator] Gemini → défi", t, n);
  const prompt = ` Tu es un formateur expert en développement web. Crée un défi de programmation de niveau ${n} en ${t} 
  destiné à un apprenant en formation développement web. Le défi doit être réaliste, pédagogique et réalisable en 
  environ 25 minutes. Le champ "code" doit contenir un exemple de solution complet, commenté et cohérent avec le défi.
   Le champ "explications" doit contenir exactement 5 explications pédagogiques. Le champ "contraintes" doit contenir 
   exactement 5 contraintes. Le champ "tags" doit contenir exactement 3 tags. Le champ "ressources" doit contenir 
   exactement 2 ressources utiles. Respecte strictement la structure JSON demandée. Ne mets aucun texte en dehors du JSON. 
   Technologie : ${t} Niveau : ${n} `;
  const raw = await callGemini(prompt, DEFI_SCHEMA);
  const defi = extractJSON(raw);

  // -------------------------------------------------------
  //  VALIDATION APPLICATION
  //  -------------------------------------------------------

  if (
    !defi.id ||
    !defi.titre ||
    !defi.techno ||
    !defi.niveau ||
    !defi.enonce ||
    !defi.solution ||
    !defi.solution.code
  ) {
    throw new Error("Défi incomplet: " + Object.keys(defi).join(", "));
  }

  //  -------------------------------------------------------
  //  CACHE
  //  -------------------------------------------------------

  nosql.insertOne({ type: "defi", techno: t, niveau: n, content: defi });
  console.log("[Generator] ✅ Défi créé:", defi.titre);
  return defi;
}

// =====================================================
// GÉNÉRATION EXERCICE ANGLAIS
//  =====================================================

async function generateAnglais(topic, difficulty) {
  const t =
    topic || TOPICS_ANGLAIS[Math.floor(Math.random() * TOPICS_ANGLAIS.length)];
  const d =
    difficulty || DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];

  // -------------------------------------------------------
  //  CACHE
  //  -------------------------------------------------------

  const cached = nosql.find(
    { type: "anglais" },
    { maxAgeHours: 24, limit: 10 },
  );
  if (cached.length >= 3) {
    console.log("[Generator] Cache NoSQL — anglais");
    return cached[Math.floor(Math.random() * cached.length)].content;
  }

  // -------------------------------------------------------
  // GEMINI
  // -------------------------------------------------------

  console.log("[Generator] Gemini → anglais", t, d);
  const prompt = ` Tu es un professeur d'anglais technique spécialisé dans le développement web. 
  Crée un exercice d'anglais technique sur : Sujet : ${t} Niveau : ${d} 
  L'exercice doit être adapté à un développeur en formation. 
  Le texte anglais doit faire environ 160 mots. La consigne "intro" doit être en français. 
  Crée exactement 3 questions de compréhension en anglais. Chaque réponse modèle doit contenir 4 à 5 phrases. 
  Crée exactement 6 entrées dans le lexique.
   Les champs "code" et "language" doivent être des chaînes 
   vides car cet exercice porte principalement sur la compréhension anglaise. 
   Respecte strictement la structure JSON demandée.
   Ne mets aucun texte en dehors du JSON. `;
  const raw = await callGemini(prompt, ANGLAIS_SCHEMA);
  const exercise = extractJSON(raw);

  // -------------------------------------------------------
  //  NORMALISATION
  // -------------------------------------------------------

  if (exercise.code === "") {
    exercise.code = null;
  }
  if (exercise.language === "") {
    exercise.language = null;
  }

  // -------------------------------------------------------
  // VALIDATION APPLICATION
  // -------------------------------------------------------

  if (
    !exercise.id ||
    !exercise.title ||
    !exercise.text ||
    !exercise.questions ||
    !exercise.questions.length
  ) {
    throw new Error("Exercice incomplet: " + Object.keys(exercise).join(", "));
  }

  // -------------------------------------------------------
  // CACHE
  //  -------------------------------------------------------

  nosql.insertOne({ type: "anglais", techno: t, niveau: d, content: exercise });
  console.log("[Generator] ✅ Anglais créé:", exercise.title);
  return exercise;
}

// =====================================================
//  NETTOYAGE CACHE
// =====================================================

function cleanCache() {
  nosql.deleteOlderThan(7);
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  generateDefi,
  generateAnglais,
  cleanCache,
  TECHNOS_DEV,
  isConfigured,
  providerLabel,
};
