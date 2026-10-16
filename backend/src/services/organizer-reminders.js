'use strict';
const db=require('../db/database');
let running=false;
async function checkAndNotify(send=require('./push.service').sendToUser,stamp=new Date().toISOString()) {
  if(running)return;
  running=true;
  try {
    const items=db.all("SELECT * FROM organizer_items WHERE archived=0 AND status!='done' AND remind_at IS NOT NULL AND remind_at<=? AND reminder_sent_at IS NULL",[stamp]);
    for(const item of items){
      const result=await send(item.user_id,{title:item.kind==='shopping'?'🛒 Rappel courses':'📌 Rappel Kanban',body:item.title,url:'/kanban.html'+(item.kind==='shopping'?'#courses':''),tag:'kanban-'+item.id});
      if(result.sent>0)db.run('UPDATE organizer_items SET reminder_sent_at=? WHERE id=? AND remind_at=? AND status!=\'done\' AND archived=0',[stamp,item.id,item.remind_at]);
    }
  } finally {running=false;}
}
module.exports={checkAndNotify};
