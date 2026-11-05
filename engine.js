/* 稳供智配 v0.2 — deterministic simulation; all times in seconds. */
(function(root){
'use strict';
const NAMES=['A','B','C','D'];
function config(scene='steady',speed){return {version:'0.3',scene,duration:3600,speed:speed??(scene==='tight'?.5:.8),load:20,unload:15,box:12,threshold:6,capacity:24,initial:scene==='tight'?[6,6,6,6]:[12,9,15,10],period:[30,24,36,30],distance:[25,40,55,70]};}
class Simulation{
 constructor(c,policy='risk'){
  this.c=JSON.parse(JSON.stringify(c));this.policy=policy;this.t=0;this.distance=0;this.busy=0;this.deliveries=0;this.logs=[];this.requests=[];this.history=[];this.decision=null;this.changed=false;
  if(!['fifo','risk','aging'].includes(policy)||!Number.isFinite(c.speed)||c.speed<=0||!Number.isFinite(c.duration)||c.duration<=0||c.threshold+c.box>c.capacity||c.load<=0||c.unload<=0||c.initial.some(x=>!Number.isInteger(x)||x<0||x>c.capacity))throw Error('仿真参数无效');
  this.stations=NAMES.map((name,i)=>({name,i,stock:c.initial[i],initial:c.initial[i],received:0,period:c.period[i],remaining:0,produced:0,stop:0,req:null}));
  this.vehicle={phase:'idle',target:null,left:0,full:0};this.process();this.sample();
 }
 log(type,msg){this.logs.push({time:this.t,type,msg});}
 begin(phase,duration){this.vehicle.phase=phase;this.vehicle.left=duration;this.vehicle.full=duration;}
 process(){
  const eps=1e-7;
  for(const s of this.stations)if(s.remaining<eps&&s.working){s.working=false;s.remaining=0;s.produced++;}
  if(this.vehicle.phase!=='idle'&&this.vehicle.left<eps){const v=this.vehicle,s=this.stations[v.target];
   if(v.phase==='load'){this.begin('out',this.c.distance[s.i]/this.c.speed);this.log('运输',`车辆装料完成，前往工位${s.name}`);}
   else if(v.phase==='out'){this.begin('unload',this.c.unload);this.log('到达',`到达工位${s.name}，开始卸料`);}
   else if(v.phase==='unload'){s.stock+=this.c.box;s.received+=this.c.box;s.req.completed=this.t;s.req=null;this.deliveries++;this.begin('back',this.c.distance[s.i]/this.c.speed);this.log('补料',`工位${s.name}入库${this.c.box}件，车辆返仓`);}
   else if(v.phase==='back'){v.phase='idle';v.target=null;v.left=0;this.log('返仓','车辆返回仓库');}
  }
  if(this.c.scene==='surge'&&!this.changed&&this.t>=900-eps){this.changed=true;this.stations[1].period=this.c.surgePeriod ?? 16;this.log('工况',`工位B后续开工节拍调整为${this.stations[1].period}秒；当前在制品照常完成`);}
  if(this.t>=this.c.duration-eps)return;
  for(const s of this.stations){
   if(!s.working&&s.stock>0){const wasStopped=s.wasStopped;s.stock--;s.remaining=s.period;s.working=true;if(wasStopped)this.log('复工',`工位${s.name}开始加工`);s.wasStopped=false;}
   if(s.stock<=this.c.threshold&&!s.req){s.req={id:this.requests.length+1,station:s.i,time:this.t,late:false,completed:null};this.requests.push(s.req);this.log('申请',`工位${s.name}申请补料，库存${s.stock}件`);}
  }
  if(this.vehicle.phase==='idle'){
   const candidates=this.stations.filter(s=>s.req&&s.stock+this.c.box<=this.c.capacity).map(s=>({i:s.i,name:s.name,time:s.req.time,support:s.remaining+s.stock*s.period,eta:this.c.load+this.c.distance[s.i]/this.c.speed+this.c.unload}));
   candidates.forEach(x=>x.slack=x.support-x.eta);
   // Waiting time and slack use seconds. Weight is fixed at one.
   for (const candidate of candidates) {
    candidate.score = this.policy === 'fifo' ? candidate.time : candidate.slack;
    if (this.policy === 'aging') candidate.score -= this.t - candidate.time;
   }
   candidates.sort((a,b)=>a.score-b.score||a.time-b.time||a.i-b.i);
   if(candidates.length){const winner=candidates[0];this.decision={time:this.t,candidates:JSON.parse(JSON.stringify(candidates)),winner:winner.i};this.vehicle.target=winner.i;this.begin('load',this.c.load);this.log('派车',`${this.policy==='aging'?'风险与等待':this.policy==='risk'?'风险优先':'先申请先送'} → 工位${winner.name}；补料余量${winner.slack.toFixed(1)}秒`);}
  }
 }
 step(seconds=1){
  const end=Math.min(this.c.duration,this.t+seconds),eps=1e-7;
  while(this.t<end-eps){
   let dt=end-this.t;
   for(const s of this.stations)if(s.working)dt=Math.min(dt,s.remaining);
   if(this.vehicle.phase!=='idle')dt=Math.min(dt,this.vehicle.left);
   if(this.c.scene==='surge'&&!this.changed&&this.t<900)dt=Math.min(dt,900-this.t);
   if(dt<eps)throw Error('时间推进异常');
   for(const s of this.stations){if(s.working)s.remaining-=dt;else{s.wasStopped=true;s.stop+=dt;if(s.req&&!s.req.late){s.req.late=true;this.log('停工',`工位${s.name}缺料等待`);}}}
   if(this.vehicle.phase!=='idle'){this.busy+=dt;if(['out','back'].includes(this.vehicle.phase))this.distance+=dt*this.c.speed;this.vehicle.left-=dt;}
   this.t+=dt;this.process();
  }
  this.sample();return this.t>=this.c.duration-eps;
 }
 sample(){if(!this.history.length||this.t>this.history.at(-1).time+1e-7)this.history.push({time:this.t,stop:this.stations.reduce((a,s)=>a+s.stop,0)/60,produced:this.stations.reduce((a,s)=>a+s.produced,0),stock:this.stations.map(s=>s.stock)});}
 run(){while(this.t<this.c.duration-1e-7)this.step();return this;}
 metrics(){return {time:this.t,stop:this.stations.reduce((a,s)=>a+s.stop,0)/60,late:this.requests.filter(r=>r.late).length,produced:this.stations.reduce((a,s)=>a+s.produced,0),distance:this.distance,deliveries:this.deliveries,pending:this.requests.filter(r=>r.completed===null).length,wip:this.stations.filter(s=>s.working).length,busy:this.t?this.busy/this.t:0};}
}
const api={config,Simulation};if(typeof module!=='undefined')module.exports=api;root.Workshop=api;
})(typeof window!=='undefined'?window:globalThis);
