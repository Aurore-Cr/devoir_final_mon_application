'use strict';
// Ajoute uniquement les clés manquantes ; conserve toutes les options existantes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),dotenv=require('dotenv'),webpush=require('web-push');
const file=path.join(__dirname,'../../.env');let content=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const env=dotenv.parse(content),add=[];
if(!env.JWT_SECRET)add.push('JWT_SECRET='+crypto.randomBytes(48).toString('hex'));
if(!env.VAPID_PUBLIC_KEY&&!env.VAPID_PRIVATE_KEY){const k=webpush.generateVAPIDKeys();add.push('VAPID_PUBLIC_KEY='+k.publicKey,'VAPID_PRIVATE_KEY='+k.privateKey);}
if(!env.VAPID_EMAIL)add.push('VAPID_EMAIL=mailto:aurore@example.com');
if(!env.PORT)add.push('PORT=3005');
if(add.length){if(fs.existsSync(file)&&!fs.existsSync(file+'.avant-kanban.bak'))fs.copyFileSync(file,file+'.avant-kanban.bak');fs.writeFileSync(file,content+'\n# Configuration Kanban (options existantes conservées)\n'+add.join('\n')+'\n',{mode:0o600});}
console.log('Configuration conservée. James utilisera le dossier backend/data sur ce PC.');
