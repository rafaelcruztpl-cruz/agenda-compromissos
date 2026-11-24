const fields=[['distributor','Distribuidor','text'],['type','Tipo','text'],['bu','BU','select',['OMADA','VIGI']],['clientType','Categoria','select',['VAD','Foco','Não foco']],['city','Cidade','text'],['startDate','Data inicial','date'],['endDate','Data final','date'],['executive','Executivo','executive'],['technical','Responsável técnico / Pré-vendas','text'],['theme','Tema','text'],['status','Status','select',['Em planejamento','Confirmado','Realizado','Concluído','Cancelado']],['internalApproval','Aprovação interna','select',['Não iniciado','Pendente','Aprovado','Reprovado']],['clientExecution','Execução pelo cliente','select',['Não iniciado','Em andamento','Confirmado','Concluído']],['readiness','Prontidão','select',['Pronto','Em atenção','Em risco','Bloqueado']],['nextAction','Próxima ação','text'],['actionDeadline','Prazo da ação','date'],['needsInvestment','Necessita investimento','select',['Sim','Não']],['investmentSource','Fonte investimento','text'],['requested','Solicitado','text'],['approvedValue','Aprovado','text'],['paidValue','Pago','text'],['targetParticipants','Meta participantes','number'],['actualParticipants','Participantes reais','number'],['postEventStatus','Status pós-evento','select',['Não iniciado','Em andamento','Concluído']],['attendanceLink','Link lista de presença','url'],['photosLink','Link fotos','url'],['invoice','Nota fiscal','text'],['nd','ND','text'],['claim','Claim','text'],['results','Resultados','textarea'],['notes','Observações','textarea']];
function formHTML(v={}){return fields.map(([k,l,t,o])=>{let c;
if(t==='select')c='<select name="'+k+'"><option value=""></option>'+o.map(x=>'<option '+(String(v[k]||'')===x?'selected':'')+'>'+x+'</option>').join('')+'</select>';
else if(t==='executive'){const cur=String(v[k]||'').trim().toLocaleUpperCase('pt-BR');const list=executiveList();if(cur&&!list.includes(cur))list.push(cur);c='<select name="'+k+'"><option value=""></option>'+list.sort((a,b)=>a.localeCompare(b,'pt-BR')).map(x=>'<option '+(cur===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>';}
else if(t==='textarea')c='<textarea name="'+k+'">'+esc(v[k])+'</textarea>';
else c='<input name="'+k+'" type="'+t+'" value="'+esc(v[k])+'">';
return '<label class="'+(['results','notes'].includes(k)?'span3':'')+'">'+l+c+'</label>'}).join('')}
function formObj(f){return Object.fromEntries(new FormData(f).entries())}
function readiness(e){if(e.status==='Realizado'||e.status==='Concluído')return'Pronto';if(!e.startDate)return'Bloqueado';return e.readiness||'Em atenção'}
function daysUntil(date){
  if(!date)return null;
  const now=new Date();now.setHours(12,0,0,0);
  const target=new Date(date+'T12:00:00');
  return Math.ceil((target-now)/86400000);
}
function prepStatus(e){
  const d=daysUntil(e.startDate);
  if(d===null)return {label:'Sem data',stage:'Definir data',next:'Definir data',nextDate:'',level:'neutral'};
  if(d<0)return {label:'Evento realizado/passado',stage:'Pós-evento',next:'Resultado / fechamento',nextDate:e.endDate?shiftDate(e.endDate,7):shiftDate(e.startDate,7),level:'done'};
  let stage='Planejamento inicial',next='Briefing',nextDate=shiftDate(e.startDate,-60),level='ok';
  if(d<=60){stage='Briefing';next='Aprovação';nextDate=shiftDate(e.startDate,-45);level='watch'}
  if(d<=45){stage='Aprovação';next='Produção';nextDate=shiftDate(e.startDate,-30);level='watch'}
  if(d<=30){stage='Produção';next='Mobilização';nextDate=shiftDate(e.startDate,-15);level='attention'}
  if(d<=15){stage='Mobilização';next='Execução';nextDate=e.startDate;level='critical'}
  if(d<=7){stage='Execução próxima';next='Evento';nextDate=e.startDate;level='critical'}
  if(d===0){stage='Hoje';next='Execução';nextDate=e.startDate;level='critical'}
  return {label:d===0?'Hoje':('Faltam '+d+' dias'),stage,next,nextDate,level};
}
function alertEventTitle(e){return esc(e.distributor?e.distributor+' · '+e.type:(e.theme||e.type))}
function renderPrepAlerts(list){
  if(!$('prepAlerts'))return;
  const active=list.filter(e=>e.startDate&&!['Realizado','Concluído','Cancelado'].includes(e.status))
    .sort((a,b)=>a.startDate.localeCompare(b.startDate))
    .slice(0,10);
  $('prepAlerts').innerHTML=active.length?active.map(e=>{
    const p=prepStatus(e);
    return '<div class="prep-card '+p.level+'" data-id="'+e.id+'">'+
      '<div class="prep-top"><div><b>'+alertEventTitle(e)+'</b><div class="muted">'+esc(e.theme||'')+(e.city?' · '+esc(e.city):'')+'</div></div><span class="countdown">'+esc(p.label)+'</span></div>'+
      '<div class="prep-grid"><div><small>Etapa atual</small><strong>'+esc(p.stage)+'</strong></div><div><small>Próximo marco</small><strong>'+esc(p.next)+'</strong><span>'+fmt(p.nextDate)+'</span></div><div><small>Responsável</small><strong>'+esc(e.executive||e.technical||'A definir')+'</strong></div><div><small>Status</small><strong>'+esc(e.status||'Em planejamento')+'</strong></div></div>'+
      (e.nextAction?'<div class="prep-action"><b>Próxima ação:</b> '+esc(e.nextAction)+(e.actionDeadline?' · prazo '+fmt(e.actionDeadline):'')+'</div>':'')+
    '</div>';
  }).join(''):'<div class="muted">Nenhum evento futuro com data definida.</div>';
  document.querySelectorAll('.prep-card').forEach(x=>x.onclick=()=>openEdit(x.dataset.id));
}
function renderDash(){const ex=$('dashExec').value,bu=$('dashBU').value,a=state.events.filter(e=>(!ex||e.executive===ex)&&(!bu||e.bu===bu));const now=new Date(),end=new Date(now);end.setDate(end.getDate()+30);const upcoming=a.filter(e=>e.startDate&&new Date(e.startDate+'T12:00:00')>=new Date(now.toDateString())&&new Date(e.startDate+'T12:00:00')<=end);$('metrics').innerHTML=[[a.length,'Eventos'],[a.filter(e=>['Em risco','Bloqueado'].includes(readiness(e))).length,'Risco/Bloqueados'],[a.filter(e=>e.internalApproval!=='Aprovado'&&!['Realizado','Concluído','Cancelado'].includes(e.status)).length,'Aprovação pendente'],[a.filter(e=>readiness(e)==='Pronto').length,'Prontos'],[a.filter(e=>e.status==='Realizado'||e.status==='Concluído').length,'Realizados']].map(x=>'<div class="card"><b>'+x[0]+'</b><span class="muted">'+x[1]+'</span></div>').join('');renderPrepAlerts(a);const groups={'0–7 dias':[], '8–15 dias':[], '16–30 dias':[], 'Sem data':a.filter(e=>!e.startDate&&!['Realizado','Concluído','Cancelado'].includes(e.status))};upcoming.forEach(e=>{const d=Math.ceil((new Date(e.startDate+'T12:00:00')-now)/86400000);groups[d<=7?'0–7 dias':d<=15?'8–15 dias':'16–30 dias'].push(e)});$('next30').innerHTML=Object.entries(groups).map(([k,v])=>'<div class="lane"><b>'+k+'</b>'+v.slice(0,8).map(e=>{const p=prepStatus(e);return '<div class="item"><b>'+alertEventTitle(e)+'</b><div class="muted">'+fmt(e.startDate)+' · '+esc(e.executive)+'</div><div class="mini-count '+p.level+'">'+esc(p.label)+' · '+esc(p.stage)+'</div></div>'}).join('')+(v.length?'':'<div class="muted" style="margin-top:8px">Sem eventos</div>')+'</div>').join('')}
function shiftDate(date,days){const x=new Date(date+'T12:00:00');x.setDate(x.getDate()+days);return x.toISOString().slice(0,10)}
function prepItems(e){
  if(e.prepRule!=='D60_D45_D30_D15_D7'||!e.startDate)return[];
  const resultBase=e.endDate||e.startDate;
  return [
    {date:shiftDate(e.startDate,-60),label:'D-60 Briefing'},
    {date:shiftDate(e.startDate,-45),label:'D-45 Aprovação'},
    {date:shiftDate(e.startDate,-30),label:'D-30 Produção'},
    {date:shiftDate(e.startDate,-15),label:'D-15 Mobilização'},
    {date:shiftDate(resultBase,7),label:'D+7 Resultado'}
  ];
}
function eventLabel(e){return esc(e.distributor?e.distributor+' · '+e.type:(e.theme||e.type))}
function slugType(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function typeClass(e){
  const t=slugType(e.type);
  if(t.includes('certificacao'))return'type-cert';
  if(t.includes('omada-day'))return'type-day';
  if(t.includes('webinar'))return'type-webinar';
  if(t.includes('workshop'))return'type-workshop';
  if(t.includes('treinamento'))return'type-training';
  if(t.includes('happy-hour'))return'type-happy';
  if(t.includes('visita'))return'type-visit';
  if(t.includes('evento-do-setor'))return'type-sector';
  if(t.includes('campanha'))return'type-campaign';
  return'type-other';
}
function prepClass(label){
  if(label.startsWith('D-60'))return'prep-d60';
  if(label.startsWith('D-45'))return'prep-d45';
  if(label.startsWith('D-30'))return'prep-d30';
  if(label.startsWith('D-15'))return'prep-d15';
  return'prep-d7';
}
function renderCalendar(){
  const val=$('calMonth').value||new Date().toISOString().slice(0,7),[y,m]=val.split('-').map(Number),ex=$('calExec').value,bu=$('calBU').value;
  const first=new Date(y,m-1,1),last=new Date(y,m,0);
  $('calTitle').textContent=first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  let h=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>'<div class="dow">'+x+'</div>').join('');
  for(let i=0;i<first.getDay();i++)h+='<div class="day"></div>';
  for(let d=1;d<=last.getDate();d++){
    const ds=y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const base=state.events.filter(e=>(!ex||e.executive===ex)&&(!bu||e.bu===bu));
    const ev=base.filter(e=>e.startDate===ds);
    const prep=base.flatMap(e=>prepItems(e).filter(p=>p.date===ds).map(p=>({event:e,...p})));
    h+='<div class="day"><b>'+d+'</b>'+
      prep.map(p=>'<div class="ev prep '+prepClass(p.label)+'" data-id="'+p.event.id+'" title="'+esc(p.event.theme||p.event.type)+'">'+esc(p.label)+' · '+eventLabel(p.event)+'</div>').join('')+
      ev.map(e=>'<div class="ev '+typeClass(e)+' '+(readiness(e)==='Pronto'?'ready':(['Em risco','Bloqueado'].includes(readiness(e))?'risk':''))+'" data-id="'+e.id+'">'+eventLabel(e)+'</div>').join('')+
      '</div>';
  }
  $('cal').innerHTML=h;
  document.querySelectorAll('.ev').forEach(x=>x.onclick=()=>openEdit(x.dataset.id));
}
