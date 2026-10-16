'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'james-kanban-test-'));
process.env.JAMES_DATA_DIR=tmp;process.env.JWT_SECRET='test-only-secret';
const db=require('../backend/src/db/database'),express=require('express');
const {signToken}=require('../backend/src/middleware/auth');
async function main(){
 await db.initDatabase();
 const uid=db.createUserWithSchedule({username:'testA',email:'a@example.test',password_hash:'test-only'});
 const other=db.createUserWithSchedule({username:'testB',email:'b@example.test',password_hash:'test-only'});
 const app=express();app.use(express.json());app.use('/api/organizer',require('../backend/src/routes/organizer'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/organizer';
 const token=signToken({id:uid}),tokenB=signToken({id:other});
 async function call(p,m='GET',body,t=token){const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 try {
  assert.equal((await call('/items','GET',null,'bad')).status,401);
  const created=await call('/items','POST',{kind:'task',title:'Appeler Canal',priority:'high',due_at:'2027-01-02T10:00:00+01:00',remind_at:'2027-01-02T09:00:00+01:00',request_key:'test-idempotent'});assert.equal(created.status,201);let item=created.data.item;
  assert.equal(item.due_at,'2027-01-02T09:00:00.000Z');
  assert.equal((await call('/items','POST',{kind:'task',title:'Appeler Canal',request_key:'test-idempotent'})).data.item.id,item.id);
  assert.equal((await call('/items')).data.items.length,1);
  assert.equal((await call('/items','GET',null,tokenB)).data.items.length,0);
  assert.equal((await call('/items/'+item.id,'PATCH',{version:item.version,status:'done'},tokenB)).status,404);
  for(const body of [{kind:'task',title:' '},{kind:'invalid',title:'x'},{kind:'task',title:'x',due_at:'2027-02-31T10:00:00Z'},{kind:'task',title:'x',due_at:'bad'},{kind:'task',title:'x',user_id:other},{kind:'shopping',title:'x',status:'doing'},{kind:'task',title:'x',due_at:'2027-01-01T10:00Z',remind_at:'2027-01-02T10:00Z'}]) assert.equal((await call('/items','POST',body)).status,400);
  let changed=await call('/items/'+item.id,'PATCH',{version:item.version,status:'doing'});assert.equal(changed.status,200);item=changed.data.item;
  assert.equal((await call('/items/'+item.id,'PATCH',{version:item.version-1,status:'done'})).status,409);
  item=(await call('/items/'+item.id,'PATCH',{version:item.version,status:'done'})).data.item;assert.ok(item.completed_at);
  item=(await call('/items/'+item.id,'PATCH',{version:item.version,archived:true})).data.item;assert.equal((await call('/items')).data.items.length,0);assert.equal((await call('/items?archived=1')).data.items.length,1);
  item=(await call('/items/'+item.id,'PATCH',{version:item.version,archived:false,status:'todo'})).data.item;assert.equal(item.completed_at,null);
  const cart=(await call('/items','POST',{kind:'shopping',title:'Skyr',quantity:'2 pots',request_key:'shopping-1'})).data.item;
  assert.equal((await call('/items/'+cart.id,'PATCH',{version:cart.version,status:'done'})).data.item.done,true);
  assert.equal((await call('/items?kind=task')).data.items.length,1);assert.equal((await call('/items?kind=shopping')).data.items.length,1);
  assert.ok((await call('/items/'+item.id+'/history')).data.history.length>=5);
  assert.equal((await call('/export')).data.items.length,2);
  const device=(await call('/device','POST',{})).data.token;assert.ok(device.startsWith('jkv1_'));assert.equal((await call('/items','GET',null,device)).status,200);
  assert.equal((await call('/device','POST',{},device)).status,401);
  assert.ok(!fs.readFileSync(path.join(tmp,'james.db')).includes(device));
  await call('/device','DELETE');assert.equal((await call('/items','GET',null,device)).status,401);
  const reminder=require('../backend/src/services/organizer-reminders');let sent=0;
  await reminder.checkAndNotify(async()=>({sent:0}),'2027-01-02T08:30:00.000Z');assert.equal(db.get('SELECT reminder_sent_at FROM organizer_items WHERE id=?',[item.id]).reminder_sent_at,null);
  await reminder.checkAndNotify(async(uid,p)=>{assert.equal(p.url,'/kanban.html');sent++;return {sent:1};},'2027-01-02T08:30:00.000Z');
  await reminder.checkAndNotify(async()=>{sent++;return {sent:1};},'2027-01-02T09:30:00.000Z');assert.equal(sent,1);
  await db.initDatabase();assert.equal((await call('/items')).data.items.length,2);assert.ok(fs.existsSync(path.join(tmp,'james.db.before-kanban-v1.bak')));
  console.log('OK : isolation, validations, idempotence, déplacements, conflits, archives, courses, historique, connexion Jarvis, rappels et persistance.');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
