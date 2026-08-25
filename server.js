'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const cron    = require('node-cron');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api',          require('./src/routes/api'));
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/user',     require('./src/routes/user'));
app.use('/api/veille',   require('./src/routes/veille'));
app.use('/api/anglais',  require('./src/routes/anglais'));
app.use('/api/defis',    require('./src/routes/defis'));
app.use('/api/generate', require('./src/routes/generate'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
  try {
    await require('./src/db/database').initDatabase();
    app.listen(PORT, () => {
      console.log('\n  ✅ JARVIS démarré → http://localhost:' + PORT + '\n');
    });
    require('./src/services/veille.service').prefetchReport().catch(() => {});
    require('./src/db/nosql').cleanOldExercises.run();
  } catch (err) {
    console.error('❌ Erreur démarrage:', err.message);
    process.exit(1);
  }
}

cron.schedule('0 7 * * *', () => require('./src/services/veille.service').prefetchReport(), { timezone: 'Europe/Paris' });
cron.schedule('* * * * *', async () => { try { await require('./src/services/push.service').checkAndNotify(); } catch {} });
cron.schedule('0 3 * * *', () => require('./src/db/nosql').cleanOldExercises.run());

start();
