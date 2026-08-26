'use strict';
const fs   = require('fs');
const path = require('path');
const DATA_DIR   = path.join(__dirname, '../../data');
const NOSQL_PATH = path.join(DATA_DIR, 'exercices_nosql.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { if (fs.existsSync(NOSQL_PATH)) return JSON.parse(fs.readFileSync(NOSQL_PATH,'utf8')); } catch {}
  return { collection:'exercices', documents:[] };
}
function save(data) { fs.writeFileSync(NOSQL_PATH, JSON.stringify(data,null,2),'utf8'); }
function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

function insertOne(doc) {
  const col = load();
  const d   = { _id:genId(), ...doc, createdAt:new Date().toISOString() };
  col.documents.push(d);
  save(col);
  return d._id;
}

function find(query, opts) {
  const col    = load();
  const maxAge = (opts&&opts.maxAgeHours)||24;
  const limit  = (opts&&opts.limit)||10;
  const cutoff = new Date(Date.now()-maxAge*3600*1000).toISOString();
  return col.documents
    .filter(d => d.createdAt>=cutoff && Object.entries(query||{}).every(([k,v])=>!v||d[k]===v))
    .slice(0, limit);
}

function deleteOlderThan(days) {
  const col = load();
  const cut = new Date(Date.now()-days*86400000).toISOString();
  const before = col.documents.length;
  col.documents = col.documents.filter(d=>d.createdAt>=cut);
  if (col.documents.length<before) save(col);
  return before-col.documents.length;
}

function countByType() {
  const col=load(); const c={defi:0,anglais:0,total:0};
  col.documents.forEach(d=>{ if(d.type==='defi')c.defi++; if(d.type==='anglais')c.anglais++; c.total++; });
  return c;
}

const getRecentExercises  = { all:(type)=>find({type},{maxAgeHours:24,limit:10}) };
const saveGeneratedExercise={ run:(data)=>{ insertOne({type:data.type,techno:data.techno||null,niveau:data.niveau||null,content:typeof data.content==='string'?JSON.parse(data.content):data.content}); return{success:true}; } };
const cleanOldExercises   = { run:()=>deleteOlderThan(7) };

module.exports = { insertOne, find, deleteOlderThan, countByType, getRecentExercises, saveGeneratedExercise, cleanOldExercises };
