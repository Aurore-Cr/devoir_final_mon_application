'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process');
(async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'james-render-test-'));
 const picker=net.createServer();await new Promise(r=>picker.listen(0,'127.0.0.1',r));const port=picker.address().port;await new Promise(r=>picker.close(r));
 // L'application est réelle. Seul le préchargement RSS est neutralisé : pas d'appel aux flux externes pendant ce test.
 const runner="const p=require.resolve('./backend/src/services/veille.service');require.cache[p]={id:p,filename:p,loaded:true,exports:{prefetchReport:async()=>{}}};require('./server.js');";
 const child=spawn(process.execPath,['-e',runner],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',JWT_SECRET:'private-test-key-not-a-real-user-secret',PORT:String(port),JAMES_DATA_DIR:folder,GEMINI_API_KEY:'',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const base='http://127.0.0.1:'+port;
 try {
  let ready=false;
  for(let i=0;i<80;i++){
   try{const r=await fetch(base+'/api/status');if(r.ok){ready=true;break;}}catch{}
   if(child.exitCode!==null)break;
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Le serveur doit démarrer en production avec une base neuve. '+output);
  const page=await fetch(base+'/kanban.html');assert.equal(page.status,200);assert.ok((await page.text()).includes('Mon Kanban'));
  const asset=await fetch(base+'/js/shopping-offline.js');assert.equal(asset.status,200);assert.ok((await asset.text()).includes('ShoppingOffline'));
  assert.equal((await fetch(base+'/api/organizer/items')).status,401);
  const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'render-test',email:'render@example.test',password:'test-password-only'})});assert.equal(registration.status,201);
  const account=await registration.json();assert.ok(account.token);
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+account.token};
  const created=await fetch(base+'/api/organizer/items',{method:'POST',headers,body:JSON.stringify({kind:'task',title:'Vérifier le déploiement',request_key:'render-smoke'})});assert.equal(created.status,201);
  const list=await fetch(base+'/api/organizer/items?kind=task',{headers});assert.equal((await list.json()).items[0].title,'Vérifier le déploiement');
  const profile=await fetch(base+'/api/auth/me',{headers});assert.equal(profile.status,200);assert.equal((await profile.json()).user.username,'render-test');
  const pair=await fetch(base+'/api/organizer/device',{method:'POST',headers,body:'{}'});assert.equal(pair.status,200);assert.ok((await pair.json()).token.startsWith('jkv1_'));
  console.log('OK Render : démarrage production, base neuve, page Kanban, assets, authentification, inscription, ajout et lecture, connexion Jarvis.');
 }finally{
  child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));fs.rmSync(folder,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
