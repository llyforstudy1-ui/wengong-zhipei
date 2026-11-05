const assert=require('node:assert/strict');const {Simulation,config}=require('./engine.js');
const results=[];
for(const scene of ['steady','surge','tight'])for(const policy of ['fifo','risk']){
 const s=new Simulation(config(scene),policy);
 while(s.t<3600-1e-7){s.step();for(const x of s.stations){assert(x.stock>=0&&x.stock<=24);assert.equal(x.initial+x.received,x.stock+x.produced+(x.working?1:0));assert(x.stop>=0&&x.stop<=s.t+1e-6);}assert(s.requests.filter(r=>r.completed===null).length<=4);}
 assert.equal(s.metrics().time,3600);assert.equal(s.requests.filter(r=>r.completed!==null).length,s.deliveries);
 const replay=new Simulation(config(scene),policy).run();assert.deepEqual(s.metrics(),replay.metrics());assert.deepEqual(s.logs,replay.logs);
 results.push({scene,policy,...s.metrics()});
}
// Zero transport shortage: stock remains sufficient throughout a 60-second run.
let c=config();c.duration=60;let s=new Simulation(c,'fifo').run();assert.equal(s.metrics().stop,0);assert.equal(s.stations[0].produced,2);
// Depleted stock is not downtime while a part is still processing.
c=config();c.duration=29;c.initial=[1,1,1,1];s=new Simulation(c,'risk').run();assert.equal(s.stations[0].stop,0);assert.equal(s.stations[1].stop,5);
// Exact physical transport distance must match elapsed travel time before arrival.
c=config('tight');c.duration=30;s=new Simulation(c,'fifo').run();assert.equal(s.distance,5);assert.equal(s.deliveries,0);
// Playback batching cannot change physical results.
c=config('surge');s=new Simulation(c,'risk');while(s.t<3600-1e-7)s.step(7);const ref=new Simulation(c,'risk').run().metrics();for(const [key,value] of Object.entries(s.metrics()))assert(Math.abs(value-ref[key])<1e-7, key);
console.log(JSON.stringify({checks:'PASS: conservation, bounds, duplicate requests, deterministic replay, transport, event timing, batching',results},null,2));
