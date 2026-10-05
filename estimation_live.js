const http = require('http');
const BASE = 'http://localhost:5000/api';
function req(m,p,b,t){
  return new Promise((resolve,reject)=>{
    const d = b ? JSON.stringify(b) : null;
    const o = {hostname:'localhost',port:5000,path:BASE.replace('http://localhost:5000','')+p,method:m,headers:{'Content-Type':'application/json',...(d?{'Content-Length':d.length}:{}),...(t?{'Authorization':'Bearer '+t}:{})}};
    const rq = http.request(o,res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{try{resolve({st:res.statusCode,bd:s?JSON.parse(s):{}})}catch(e){resolve({st:res.statusCode,bd:s})}})});
    rq.on('error',reject); if(d) rq.write(d); rq.end();
  });
}
async function login(){ const x=await req('POST','/auth/login',{email:'pm@demo.com',password:'password123'}); if(x.st!==200||!x.bd.data?.token) throw new Error('login'); return x.bd.data.token; }
async function main(){
  let tok,woid=null,titems=[],tgr=[],ok=true;
  try{
    tok=await login();
    const wn='WO-EST-'+Date.now()+'-'+Math.floor(Math.random()*1000);
    const c=await req('POST','/work-orders',{wo_number:wn,customer:'TEST',groups:[{machine_model_id:1,serial_number:'SN-A'},{machine_model_id:1,serial_number:'SN-B'}],items:[{title:'I1',description:'',quantity:1,documentation_readiness:'READY'},{title:'I2',description:'',quantity:2,documentation_readiness:'READY'},{title:'I3',description:'',quantity:5,documentation_readiness:'READY'}]},tok);
    if(c.st!==201) throw new Error('create'+c.st);
    woid=c.bd.data.id; tgr=(c.bd.data.groups||[]).map(g=>g.id); titems=(c.bd.data.items||[]).map(i=>i.id);
    const a=await req('POST','/work-orders/'+woid+'/analyze',{},tok); if(a.st!==200) throw new Error('analyze'+a.st);
    const g=await req('GET','/work-orders/'+woid,null,tok); if(g.st!==200) throw new Error('get'+g.st);
    const wo=g.bd.data, its=wo.items||[];
    let sumClh=0;
    for(const it of its){
      const est=Number(it.estimated_hours||0); const clh=it.estimation_breakdown?Number(it.estimation_breakdown.other_mh||0):0;
      if(Math.abs(est-clh)>1e-3){ ok=false; console.error('mismatch est!=clh',it.id); }
      if(it.work_order_group_id!==null){ ok=false; console.error('not null group',it.id); }
      sumClh+=clh;
    }
    const tot=Number(wo.total_estimated_hours||0); if(Math.abs(tot-sumClh)>1e-3){ ok=false; console.error('total mismatch'); }
    if(!ok) throw new Error('assert failed');
    console.log('PASS items='+its.length+' groups='+wo.groups.length+' total='+tot);
  }catch(e){ console.error('FAIL',e.message); process.exitCode=1; }
  finally{
    try{ for(const i of titems.reverse()){ await req('DELETE','/work-orders/'+(woid||'')+'/items/'+i,null,tok).catch(()=>{}); } for(const gid of tgr.reverse()){ await req('DELETE','/work-orders/'+(woid||'')+'/groups/'+gid,null,tok).catch(()=>{}); } if(woid){ await req('DELETE','/work-orders/'+woid,null,tok).catch(()=>{}); } }catch{}
    console.log('cleanup done');
  }
}
main();