'use strict';
const https = require('https');
const nosql = require('../db/nosql');

function getKey()        { return process.env.GEMINI_API_KEY || ''; }
function getModel()      { return process.env.GEMINI_MODEL   || 'gemini-1.5-flash'; }
function isConfigured()  { return !!getKey(); }
function providerLabel() { return isConfigured() ? 'Google Gemini (gratuit)' : 'Non configuré'; }

function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    const key = getKey();
    if (!key) { reject(new Error('GEMINI_API_KEY manquante dans .env')); return; }
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
    });
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path    : '/v1beta/models/' + getModel() + ':generateContent?key=' + key,
      method  : 'POST',
      headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(raw);
          if (j.error) { reject(new Error('Gemini: ' + j.error.message)); return; }
          const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
          t ? resolve(t) : reject(new Error('Gemini: réponse vide — ' + raw.slice(0,150)));
        } catch(e) { reject(new Error('Gemini JSON invalide: ' + raw.slice(0,150))); }
      });
    });
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Timeout 45s')); });
    req.on('error', e => reject(new Error('Réseau: ' + e.message)));
    req.write(body); req.end();
  });
}

function extractJSON(raw) {
  if (!raw) throw new Error('Réponse vide');
  try { return JSON.parse(raw.trim()); } catch {}
  const md = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (md) { try { return JSON.parse(md[1]); } catch {} }
  const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
  if (i !== -1 && j > i) {
    try { return JSON.parse(raw.slice(i, j+1)); } catch {}
    try { return JSON.parse(raw.slice(i, j+1).replace(/,(\s*[}\]])/g, '$1')); } catch(e) {
      throw new Error('JSON invalide: ' + e.message);
    }
  }
  throw new Error('Aucun JSON dans: ' + raw.slice(0,100));
}

const TECHNOS_DEV    = ['JavaScript','TypeScript','React','Angular','Vue.js','Express','Node.js','HTML/CSS','MySQL','PHP','Symfony','Git','Docker'];
const TOPICS_ANGLAIS = ['GraphQL API design','Docker containerisation','OAuth 2.0','CSS Grid Layout','SQL Transactions','WebSockets','TypeScript Generics','React Hooks','Microservices','REST API versioning','Progressive Web Apps','Algorithm complexity Big O','Database indexing','SOLID principles','Test-Driven Development'];
const NIVEAUX        = ['Facile','Moyen'];
const DIFFICULTIES   = ['B2','C1'];
const SYS            = 'Tu réponds UNIQUEMENT avec un JSON valide. Pas de texte avant/après. Pas de markdown. Commence par { et termine par }.';

function langCode(t) {
  return {MySQL:'sql',PHP:'php','HTML/CSS':'css',TypeScript:'typescript',React:'jsx',Angular:'typescript','Vue.js':'javascript',Docker:'bash',Git:'bash',Symfony:'php'}[t]||'javascript';
}

async function generateDefi(techno, niveau) {
  const t = techno || TECHNOS_DEV[Math.floor(Math.random()*TECHNOS_DEV.length)];
  const n = niveau || NIVEAUX[Math.floor(Math.random()*NIVEAUX.length)];
  const cached = nosql.find({type:'defi',techno:t,niveau:n},{maxAgeHours:24});
  if (cached.length > 0) { console.log('[Generator] Cache NoSQL — défi',t,n); return cached[Math.floor(Math.random()*cached.length)].content; }
  console.log('[Generator] Gemini → défi',t,n);
  const prompt = SYS + '\n\nCrée un défi de code '+n+' en '+t+' pour bootcamp web. Format JSON:\n{"id":"gen_'+Date.now()+'","titre":"Titre accrocheur","techno":"'+t+'","niveau":"'+n+'","tags":["t1","t2","t3"],"duree":"25 min","objectif":"Objectif (2 phrases).","enonce":"Problème à résoudre (4 phrases).","contraintes":["C1","C2","C3","C4","C5"],"ressources":["MDN - sujet1","Doc - sujet2"],"solution":{"methodologie":"Approche (3 phrases).","langage":"'+langCode(t)+'","code":"// Code complet commenté (25-40 lignes)","explications":["P1","P2","P3","P4","P5"]}}';
  const defi = extractJSON(await callGemini(prompt));
  if (!defi.titre || !defi.enonce || !defi.solution?.code) throw new Error('Défi incomplet: '+Object.keys(defi).join(', '));
  nosql.insertOne({type:'defi',techno:t,niveau:n,content:defi});
  console.log('[Generator] ✅ Défi créé:', defi.titre);
  return defi;
}

async function generateAnglais(topic, difficulty) {
  const t = topic      || TOPICS_ANGLAIS[Math.floor(Math.random()*TOPICS_ANGLAIS.length)];
  const d = difficulty || DIFFICULTIES[Math.floor(Math.random()*DIFFICULTIES.length)];
  const cached = nosql.find({type:'anglais'},{maxAgeHours:24,limit:10});
  if (cached.length >= 3) { console.log('[Generator] Cache NoSQL — anglais'); return cached[Math.floor(Math.random()*cached.length)].content; }
  console.log('[Generator] Gemini → anglais',t,d);
  const prompt = SYS + '\n\nCrée un exercice d\'anglais technique sur "'+t+'", niveau '+d+'. Format JSON:\n{"id":"gen_'+Date.now()+'","category":"Architecture Web","difficulty":"'+d+'","title":"Titre anglais","intro":"Consigne en français.","text":"Texte anglais technique 160 mots sur '+t+'.","code":null,"language":null,"translation_challenge":"Consigne traduction.","questions":[{"id":"q1","question":"What is the main purpose?"},{"id":"q2","question":"How does it work technically?"},{"id":"q3","question":"What are the practical advantages?"}],"model_translation":"Traduction française complète.","model_answers":["Réponse Q1 (4-5 phrases).","Réponse Q2 (4-5 phrases).","Réponse Q3 (4-5 phrases)."],"lexicon":[{"term":"t1","french":"f1","definition":"d1"},{"term":"t2","french":"f2","definition":"d2"},{"term":"t3","french":"f3","definition":"d3"},{"term":"t4","french":"f4","definition":"d4"},{"term":"t5","french":"f5","definition":"d5"},{"term":"t6","french":"f6","definition":"d6"}]}';
  const exercise = extractJSON(await callGemini(prompt));
  if (!exercise.title || !exercise.text || !exercise.questions?.length) throw new Error('Exercice incomplet: '+Object.keys(exercise).join(', '));
  nosql.insertOne({type:'anglais',techno:t,niveau:d,content:exercise});
  console.log('[Generator] ✅ Anglais créé:', exercise.title);
  return exercise;
}

function cleanCache() { nosql.deleteOlderThan(7); }

module.exports = { generateDefi, generateAnglais, cleanCache, TECHNOS_DEV, isConfigured, providerLabel };
