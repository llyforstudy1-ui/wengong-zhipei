'use strict';
const $=id=>document.getElementById(id),{Simulation,config}=Workshop;
let sim,running=false,last=0,budget=0,comparison=null;
const colors=['#285b89','#b77921','#25735c','#8a6b9e'];
const sceneNames={steady:'平稳生产',surge:'工位B局部加速',tight:'配送紧张'};
const policyNames = {fifo:'先申请先配送',risk:'缺料风险优先',aging:'风险＋等待'};
const phaseNames={idle:'仓库待命',load:'仓库装料',out:'运输前往',unload:'工位卸料',back:'空车返仓'};
const pos=[[285,93],[285,267],[580,93],[580,267]];
const time=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const num=(n,d=1)=>n.toFixed(d);
function currentConfig(){return config($('scene').value,Number($('speed').value));}
function loadEstimate(c, afterChange = false) {
 const periods = [...c.period];
 if (afterChange && c.scene === 'surge') periods[1] = c.surgePeriod ?? 16;
 return periods.reduce((total, period, i) => total +
  (c.load + c.unload + 2 * c.distance[i] / c.speed) / (c.box * period), 0);
}
function updateCapacity(c) {
 const before = loadEstimate(c);
 const after = loadEstimate(c, true);
 const values = c.scene === 'surge' ? `${num(before*100)}% → ${num(after*100)}%` : `${num(before*100)}%`;
 $('capacityNote').textContent = `理论运力负荷 ${values}。${after > 1 ? '超过100%，单车难以长期满足连续生产需求。' : '理论总运力可覆盖需求，具体停工仍受补料时机影响。'}`;
}
function reset(){running=false;budget=0;sim=new Simulation(currentConfig(),$('policy').value);comparison=null;updateCapacity(sim.c);$('exportCompare').disabled=true;$('compareResults').innerHTML='<div class="body muted">参数已更新，请计算当前工况的完整对比。</div>';$('compareChart').innerHTML='<div class="muted">完整计算后显示曲线</div>';$('comparisonContext').textContent=`${sceneNames[sim.c.scene]} / 车速 ${sim.c.speed} m/s`;$('sceneNote').textContent={steady:'各工位节拍稳定，观察正常负荷下的补料顺序。',surge:'第15分钟，工位B后续开工节拍由24秒缩短为16秒。',tight:'初始库存均为6件，多工位同时申请，默认车速0.5 m/s。'}[sim.c.scene];render();}
function chart(lines,maxX,maxY,yLabel){
 const w=820,h=150,l=50,r=20,top=17,b=30;maxY=Math.max(1,maxY);const x=t=>l+t/maxX*(w-l-r),y=v=>h-b-v/maxY*(h-b-top);
 let s=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${yLabel}"><text x="0" y="12" font-size="10" fill="#7b8995">${yLabel}</text>`;
 for(let i=0;i<=4;i++){const v=maxY*i/4;s+=`<path d="M${l} ${y(v)}H${w-r}" stroke="#e8edf0"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#7b8995">${num(v,maxY<10?1:0)}</text>`;}
 for(let i=0;i<=6;i++){const t=maxX*i/6;s+=`<text x="${x(t)}" y="${h-8}" text-anchor="middle" font-size="10" fill="#7b8995">${Math.round(t/60)}分</text>`;}
 for(const line of lines){const stride=Math.max(1,Math.floor(line.values.length/700));const data=line.values.filter((_,i)=>i%stride===0||i===line.values.length-1);s+=`<polyline points="${data.map(p=>`${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="${line.color}" stroke-width="1.8"/>`;}
 return s+'</svg>';
}
function render(){
 const m=sim.metrics();$('clock').textContent=time(sim.t);$('mStop').innerHTML=num(m.stop)+'<small>工位·min</small>';$('mProduced').innerHTML=m.produced+'<small>件</small>';$('mLate').innerHTML=m.late+'<small>次</small>';$('mDistance').innerHTML=num(m.distance,0)+'<small>m</small>';
 $('progress').style.width=sim.t/sim.c.duration*100+'%';$('runState').textContent=sim.t>=3600?'已完成':running?'运行中':sim.t?'已暂停':'待运行';$('play').textContent=running?'暂停':sim.t>=3600?'重新运行':sim.t?'继续':'开始仿真';$('supplement').textContent=`配送完成 ${m.deliveries} 次 · 未完成申请 ${m.pending} 项 · 在制品 ${m.wip} 件`;
 $('mapStations').innerHTML=sim.stations.map((s,i)=>{const [x,y]=pos[i],color=!s.working?colorsFor('stop'):s.req?colorsFor('warn'):colorsFor('work');return `<rect x="${x-62}" y="${y-36}" width="124" height="72" rx="5" fill="white" stroke="${color}" stroke-width="2"/><circle cx="${x-43}" cy="${y-16}" r="4" fill="${color}"/><text x="${x-30}" y="${y-12}" font-size="14" fill="#304959">工位 ${s.name}</text><text x="${x}" y="${y+11}" text-anchor="middle" font-size="12" fill="${color}">${!s.working?'缺料停工':s.req?'加工 / 已申请':'正常加工'}</text><text x="${x+51}" y="${y+28}" text-anchor="end" fill="#85929c" font-size="9">${s.period}秒/件</text>`;}).join('');
 $('stationCards').innerHTML=sim.stations.map((s,i)=>{const color=!s.working?'#bc4545':s.req?'#b77921':'#25735c';return `<div class="station"><b style="color:${colors[i]}">工位 ${s.name}</b><span style="float:right">${s.stock} / 24 件</span><div class="bar"><span style="width:${s.stock/24*100}%;background:${color}"></span></div><div>完工 ${s.produced} · 停工 ${num(s.stop/60)}分</div></div>`;}).join('');
 const v=sim.vehicle;let x=155,y=180;
 if(v.target!==null){const [tx,ty]=pos[v.target];$('route').setAttribute('d',`M155 180H${tx}V${ty}`);let progress=v.phase==='load'?0:v.phase==='out'?1-v.left/v.full:v.phase==='back'?v.left/v.full:1;const pathLength=tx-155+Math.abs(ty-180),p=pathLength*progress;if(p<=tx-155)x=155+p;else{x=tx;y=180+Math.sign(ty-180)*(p-(tx-155));}}
 else $('route').setAttribute('d','');
 $('truck').setAttribute('transform',`translate(${x} ${y})`);$('truckLabel').setAttribute('x',x);$('truckLabel').setAttribute('y',y+32);$('truckLabel').textContent=phaseNames[v.phase]+(v.target!==null?' · '+sim.stations[v.target].name:'');
 const d=sim.decision;$('decisionTime').textContent=d?time(d.time):'待派车';
 $('decision').innerHTML=d?`<div class="reason"><b>${sim.policy==='aging'?'优先评分最小的工位':sim.policy==='risk'?'优先补料余量最小的工位':'优先申请时间最早的工位'} → ${sim.stations[d.winner].name}</b><p>${sim.policy==='aging'?'评分＝余量−等待秒数。等待越久，评分越低。':sim.policy==='risk'?'余量越小，补料越紧迫；负值表示预计赶不上。':'按申请先后排序；余量仅作观察，不参与选择。'}</p></div><div class="tablewrap"><table><thead><tr><th>候选</th><th>申请时刻</th><th>可支撑</th><th>送达需时</th><th>余量</th><th>已等待</th><th>评分</th></tr></thead><tbody>${d.candidates.map(c=>`<tr class="${c.i===d.winner?'chosen':''}"><td>${c.name}${c.i===d.winner?' ✓':''}</td><td>${time(c.time)}</td><td>${num(c.support,0)}s</td><td>${num(c.eta,1)}s</td><td>${num(c.slack,1)}s</td><td>${num(d.time-c.time,1)}s</td><td>${sim.policy==='fifo'?'按申请时刻':num(c.score,1)+'s'}</td></tr>`).join('')}</tbody></table></div><p class="muted">表中为本次派车时刻的快照；执行中不改派。</p>`:'<p class="muted">工位库存降至阈值后生成申请。车辆在仓库空闲时选择任务。</p>';
 $('logs').innerHTML=sim.logs.slice(-30).reverse().map(e=>`<div class="log"><time>${time(e.time)}</time><em>${e.type}</em><span>${e.msg}</span></div>`).join('')||'<p class="muted">尚无事件，点击开始仿真。</p>';
 $('inventoryChart').innerHTML=chart(colors.map((color,i)=>({color,values:sim.history.map(h=>[h.time,h.stock[i]])})),3600,24,'库存 / 件');
}
function colorsFor(s){return {stop:'#bc4545',warn:'#b77921',work:'#25735c'}[s];}
function tab(which){$('live').classList.toggle('hidden',which!=='live');$('comparison').classList.toggle('visible',which==='compare');$('liveTab').classList.toggle('active',which==='live');$('compareTab').classList.toggle('active',which==='compare');if(which==='compare'){running=false;render();}}
function compare() {
 running = false;
 render();
 const c = currentConfig();
 const policies = ['fifo', 'risk', 'aging'];
 comparison = {c};
 for (const policy of policies) comparison[policy] = new Simulation(c, policy).run();
 const metrics = policies.map(policy => comparison[policy].metrics());
 const rows = [
  ['缺料停工合计', 'stop', 1, '工位·min'],
  ['补料迟到', 'late', 0, '次'],
  ['完工数量', 'produced', 0, '件'],
  ['累计配送距离', 'distance', 1, 'm'],
  ['配送完成', 'deliveries', 0, '次'],
  ['未完成申请', 'pending', 0, '项'],
  ['在制品', 'wip', 0, '件']
 ];
 const table = rows.map(([label, key, digits, unit]) =>
  `<tr><td>${label}</td>${metrics.map(m => `<td>${num(m[key], digits)} ${unit}</td>`).join('')}</tr>`).join('');
 const difference = metrics[2].stop - metrics[0].stop;
 const outcome = Math.abs(difference) < 0.00001 ? '与先申请先配送持平' :
  `${difference < 0 ? '比先申请先配送减少' : '比先申请先配送增加'} ${num(Math.abs(difference))} 工位·分钟`;
 $('compareResults').innerHTML = `<div class="tablewrap"><table><thead><tr><th>指标</th>${policies.map(p => `<th>${policyNames[p]}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table></div><div class="comparehint">${sceneNames[c.scene]} · 车速 ${c.speed} m/s。风险＋等待的累计停工${outcome}。请结合完工数量和各工位停工分布判断。</div>`;
 const maximum = Math.max(...metrics.map(m => m.stop));
 $('compareChart').innerHTML = chart(policies.map((policy, i) => ({
  color: ['#8996a2', '#285b89', '#25735c'][i],
  values: comparison[policy].history.map(h => [h.time, h.stop])
 })), 3600, Math.ceil(maximum / 5) * 5, '停工 / 工位·min');
 $('exportCompare').disabled = false;
}
function download(name,content,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function csv(rows){return '\uFEFF'+rows.map(row=>row.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\r\n');}
function resultRows(s){return [['模型版本',s.c.version],['策略',s.policy],['运行至秒',s.t],['参数JSON',JSON.stringify(s.c)],[],['统计项','数值','单位'],...Object.entries(s.metrics()).map(([k,v])=>[k,v,{time:'秒',stop:'工位·分钟',late:'次',produced:'件',distance:'米',deliveries:'次',pending:'项',wip:'件',busy:'比例'}[k]]),[],['工位','初始库存','收料','现有库存','完工','在制品','停工秒'],...s.stations.map(x=>[x.name,x.initial,x.received,x.stock,x.produced,x.working?1:0,x.stop]),[],['时间秒','事件类型','事件'],...s.logs.map(e=>[e.time,e.type,e.msg]),[],['采样时间秒','累计停工_工位分钟','完工件数','A库存','B库存','C库存','D库存'],...s.history.map(h=>[h.time,h.stop,h.produced,...h.stock])];}
$('play').onclick=()=>{if(sim.t>=3600)reset();running=!running;last=performance.now();render();};$('reset').onclick=reset;$('finish').onclick=()=>{running=false;sim.run();render();};$('scene').onchange=()=>{$('speed').value=$('scene').value==='tight'?.5:.8;reset();};$('policy').onchange=reset;$('speed').onchange=()=>{const v=Number($('speed').value);if(!Number.isFinite(v)||v<.2||v>2){$('speed').value=sim.c.speed;alert('车速请输入0.2至2之间的数值。');return;}reset();};$('rate').oninput=()=>{$('rateText').textContent=$('rate').value+'×';};$('liveTab').onclick=()=>tab('live');$('compareTab').onclick=()=>tab('compare');$('compare').onclick=compare;$('exportRun').onclick=()=>download(`稳供智配_${sim.c.scene}_${sim.policy}_${Math.floor(sim.t)}秒.csv`,csv(resultRows(sim)));$('exportCompare').onclick=()=>{if(comparison)download('稳供智配_三策略对比.csv',csv([['先申请先配送'],...resultRows(comparison.fifo),[],['缺料风险优先'],...resultRows(comparison.risk),[],['风险＋等待'],...resultRows(comparison.aging)]));};
$('downloadPage').onclick=async()=>{try{let html='<!doctype html>\n'+document.documentElement.outerHTML;if(!html.includes('src="engine.js?v=0.3"')){download('稳供智配_离线版.html',html,'text/html;charset=utf-8');return;}const [engine,app]=await Promise.all(['engine.js?v=0.3','app.js?v=0.3'].map(async p=>{const r=await fetch(p);if(!r.ok)throw Error('资源读取失败');return r.text();}));html=html.replace('<script src="engine.js?v=0.3"><\/script>','<script>'+engine+'</'+'script>').replace('<script src="app.js?v=0.3"><\/script>','<script>'+app+'</'+'script>');download('稳供智配_离线版.html',html,'text/html;charset=utf-8');}catch(e){alert('当前浏览器不允许读取本地源文件。请使用提供的单文件离线版，或下载完整程序包。');}};
function frame(now){if(running){budget+=Math.min((now-last)/1000,.25)*Number($('rate').value);let count=0;while(budget>=1&&count<300){const done=sim.step();budget--;count++;if(done){running=false;budget=0;break;}}if(count)render();}last=now;requestAnimationFrame(frame);}reset();requestAnimationFrame(frame);
