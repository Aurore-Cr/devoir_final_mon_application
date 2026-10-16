'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'james-ui-'));process.env.JAMES_DATA_DIR=temp;process.env.JWT_SECRET='ui-test-only';
const express=require('express'),db=require('../backend/src/db/database'),{signToken}=require('../backend/src/middleware/auth');
const {chromium}=require('playwright');
(async()=>{
 await db.initDatabase();const id=db.createUserWithSchedule({username:'ui',email:'ui@example.test',password_hash:'test'});const token=signToken({id});
 const app=express();app.use(express.json());app.use('/api/organizer',require('../backend/src/routes/organizer'));app.use(express.static(path.join(__dirname,'../frontend/public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1360,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{localStorage.setItem('james_token',t)},token);await page.goto(url+'/kanban.html');await page.waitForFunction(()=>document.querySelector('#feedback').textContent==='Listes à jour.');
  await page.click('#add');await page.fill('[name=title]','Appeler Canal');await page.fill('[name=notes]','Négocier le pack séries');await page.fill('[name=due_at]','2027-01-02T10:00');await page.fill('[name=remind_at]','2027-01-02T09:00');await page.click('#save');await page.waitForSelector('#board .card');
  await page.selectOption('#board [data-move]','doing');await page.waitForSelector('#board [data-column=doing] .card');
  await page.reload();await page.waitForSelector('#board [data-column=doing] .card');await page.selectOption('#board [data-move]','done');await page.waitForSelector('#board [data-column=done] .card');
  await page.click('#board [data-archive]');await page.waitForFunction(()=>document.querySelectorAll('#board .card').length===0);await page.check('#archive-filter');await page.waitForSelector('#board .card');await page.click('#board [data-archive]');await page.waitForFunction(()=>document.querySelectorAll('#board .card').length===0);await page.uncheck('#archive-filter');await page.waitForSelector('#board .card');
  await page.click('#board [data-history]');await page.waitForSelector('#history-dialog[open]');assert.ok((await page.textContent('#history-content')).includes('Modification'));await page.click('#close-history');
  await page.click('#tab-shopping');await page.click('#add');await page.fill('[name=title]','Skyr');await page.fill('[name=quantity]','2 pots');await page.click('#save');await page.waitForSelector('#shopping .card');await page.check('#shopping [data-check]');await page.waitForSelector('#shopping .checked');await page.reload();await page.waitForSelector('#shopping .checked');
  await page.click('#add');await page.fill('[name=title]','<img src=x onerror=alert(1)>');await page.click('#save');await page.waitForFunction(()=>document.querySelector('#shopping').textContent.includes('<img src=x'));assert.equal(await page.locator('#shopping img').count(),0);
  await page.setViewportSize({width:390,height:844});await page.click('#tab-tasks');await page.waitForSelector('#board .card');await page.screenshot({path:'/workspace/scratch/89ccc67b025d/kanban-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1360,height:950});await page.screenshot({path:'/workspace/scratch/89ccc67b025d/kanban-desktop.png',fullPage:true});assert.deepEqual(errors,[]);console.log('OK UI : création, échéances, déplacements, rechargement, archives/restauration, historique, courses/coches, XSS et affichage mobile.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
