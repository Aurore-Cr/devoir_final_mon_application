'use strict';
// Petit cache privé par compte, limité aux courses. Pas de cache des tokens.
class ShoppingOffline {
 constructor(storage,key){this.storage=storage;this.key=key;}
 state(){try{return JSON.parse(this.storage.getItem(this.key))||{items:[],pending:{}};}catch{return {items:[],pending:{}};}}
 save(state){this.storage.setItem(this.key,JSON.stringify(state));}
 remember(items){const s=this.state();s.items=items;this.save(s);}
 queue(item,status){const s=this.state(),old=s.pending[item.id];s.pending[item.id]={id:item.id,title:item.title,status,version:old?old.version:item.version};this.save(s);}
 pending(){return Object.values(this.state().pending);}
 acknowledge(id){const s=this.state();delete s.pending[id];this.save(s);}
 view(items=this.state().items){const pending=this.state().pending;return items.map(x=>pending[x.id]?{...x,status:pending[x.id].status,done:pending[x.id].status==='done',local_pending:true}:x);}
}
if(typeof module!=='undefined')module.exports=ShoppingOffline;
