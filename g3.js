function filtered(){const q=$('q').value.toLowerCase(),ex=$('fExec').value,st=$('fStatus').value,ty=$('fType').value,fr=$('from').value,to=$('to').value;return state.events.filter(e=>{const s=e.startDate||'',en=e.endDate||s;return(!q||JSON.stringify(e).toLowerCase().includes(q))&&(!ex||e.executive===ex)&&(!st||e.status===st)&&(!ty||e.type===ty)&&((!fr&&!to)||(s&&(!to||s<=to)&&(!fr||en>=fr)))})}
function renderManage(){$('eventRows').innerHTML=filtered().sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')).map(e=>'<tr><td>'+fmt(e.startDate)+'</td><td>'+(String(e.clientType).toUpperCase()==='VAD'?'<span class="pill vad">VAD</span> ':'')+esc(e.distributor)+'</td><td>'+esc(e.type)+'</td><td>'+esc(e.bu)+'</td><td>'+esc(e.executive)+'</td><td>'+esc(e.status)+'</td><td>'+esc(readiness(e))+'</td><td><button class="secondary edit" data-id="'+e.id+'">Editar</button></td></tr>').join('');document.querySelectorAll('.edit').forEach(x=>x.onclick=()=>openEdit(x.dataset.id))}
function renderPost(){$('postRows').innerHTML=state.events.filter(e=>['Realizado','Concluído'].includes(e.status)||e.postEventStatus).sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')).map(e=>'<tr><td>'+esc(e.distributor)+' · '+esc(e.type)+'</td><td>'+fmt(e.startDate)+'</td><td>'+esc(e.actualParticipants)+'</td><td>'+esc(e.postEventStatus)+'</td><td>'+esc(e.invoice)+'</td><td>'+esc(e.nd)+'</td><td>'+esc(e.claim)+'</td><td><button class="secondary pedit" data-id="'+e.id+'">Editar</button></td></tr>').join('');document.querySelectorAll('.pedit').forEach(x=>x.onclick=()=>openEdit(x.dataset.id))}
function renderReports(){const months={};state.events.forEach(e=>{const k=(e.startDate||'Sem data').slice(0,7);months[k]??={n:0,r:0,p:0,a:0,paid:0};const x=months[k];x.n++;if(['Realizado','Concluído'].includes(e.status))x.r++;else if(e.status==='Em planejamento')x.p++;x.a+=num(e.approvedValue);x.paid+=num(e.paidValue)});$('reportCards').innerHTML=[[state.events.length,'Total eventos'],[state.events.filter(e=>['Realizado','Concluído'].includes(e.status)).length,'Realizados'],[state.events.filter(e=>e.status==='Em planejamento').length,'Em planejamento'],[state.events.reduce((s,e)=>s+num(e.approvedValue),0),'Investimento aprovado'],[state.events.reduce((s,e)=>s+num(e.paidValue),0),'Pago']].map((x,i)=>'<div class="card"><b>'+(i>2?money(x[0]):x[0])+'</b><span class="muted">'+x[1]+'</span></div>').join('');$('reportRows').innerHTML=Object.entries(months).sort().map(([k,x])=>'<tr><td>'+k+'</td><td>'+x.n+'</td><td>'+x.r+'</td><td>'+x.p+'</td><td>'+money(x.a)+'</td><td>'+money(x.paid)+'</td></tr>').join('')}
function renderRules(){$('ruleRows').innerHTML=Object.entries(state.rules).sort().map(([t,r])=>'<tr><td><input data-type="'+esc(t)+'" data-k="__name" value="'+esc(t)+'"></td>'+ruleFields.map(k=>'<td><select data-type="'+esc(t)+'" data-k="'+k+'">'+['Obrigatório','Opcional','Não se aplica'].map(v=>'<option '+(r[k]===v?'selected':'')+'>'+v+'</option>').join('')+'</select></td>').join('')+'</tr>').join('');$('ruleRows').querySelectorAll('select').forEach(el=>el.onchange=async()=>{state.rules[el.dataset.type][el.dataset.k]=el.value;await save();msg('Regra salva.')})}
function renderDists(){$('distRows').innerHTML=state.distributors.map((d,i)=>'<tr><td><input data-i="'+i+'" data-k="name" value="'+esc(d.name)+'"></td><td><select data-i="'+i+'" data-k="category">'+['VAD','Foco','Não foco'].map(v=>'<option '+(d.category===v?'selected':'')+'>'+v+'</option>').join('')+'</select></td><td><input data-i="'+i+'" data-k="executiveOmada" value="'+esc(d.executiveOmada)+'"></td><td><input data-i="'+i+'" data-k="executiveVigi" value="'+esc(d.executiveVigi)+'"></td><td><button class="danger dd" data-i="'+i+'">Excluir</button></td></tr>').join('');$('distRows').querySelectorAll('input,select').forEach(el=>el.onchange=async()=>{state.distributors[+el.dataset.i][el.dataset.k]=el.value;await save();renderAll();msg('Distribuidor salvo.')});document.querySelectorAll('.dd').forEach(x=>x.onclick=async()=>{state.distributors.splice(+x.dataset.i,1);await save();renderAll()})}
function openEdit(id){editing=id;const e=state.events.find(x=>x.id===id);$('editForm').innerHTML=formHTML(e);$('modal').classList.add('open')}
function renderAll(){fillFilters();renderDash();renderCalendar();renderManage();renderPost();renderReports();renderRules();renderDists()}
function showTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='reports')renderReports();if(id==='calendar')renderCalendar()}
function download(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

let usersData=[];
const roleLabel={admin:'Administrador',operator:'Operador',read_only:'Somente leitura'};

async function loadUsers(){
  if(!window.currentUser||window.currentUser.role!=='admin')return;
  const r=await fetch('/api/users',{cache:'no-store'});
  if(!r.ok){msg('Não foi possível carregar os usuários.',true);return}
  usersData=await r.json();
  renderUsers();
}

function renderUsers(){
  if(!$('userRows'))return;
  $('userRows').innerHTML=usersData.map(u=>'<tr>'+
    '<td><input class="u-name" data-id="'+u.id+'" value="'+esc(u.displayName)+'"></td>'+
    '<td><b>'+esc(u.username)+'</b></td>'+
    '<td><select class="u-role" data-id="'+u.id+'">'+['read_only','operator','admin'].map(r=>'<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+roleLabel[r]+'</option>').join('')+'</select></td>'+
    '<td><select class="u-active" data-id="'+u.id+'"><option value="true" '+(u.active?'selected':'')+'>Ativo</option><option value="false" '+(!u.active?'selected':'')+'>Inativo</option></select></td>'+
    '<td><input class="u-pass" data-id="'+u.id+'" type="password" placeholder="deixe vazio para manter"></td>'+
    '<td><div class="rowactions"><button class="secondary u-save" data-id="'+u.id+'">Salvar</button><button class="danger u-del" data-id="'+u.id+'">Excluir</button></div></td>'+
  '</tr>').join('');

  document.querySelectorAll('.u-save').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.id;
    const name=document.querySelector('.u-name[data-id="'+id+'"]').value;
    const role=document.querySelector('.u-role[data-id="'+id+'"]').value;
    const active=document.querySelector('.u-active[data-id="'+id+'"]').value==='true';
    const password=document.querySelector('.u-pass[data-id="'+id+'"]').value;
    const r=await fetch('/api/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:name,role,active,password})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok){msg(out.error||'Falha ao atualizar usuário.',true);return}
    await loadUsers();msg('Usuário atualizado.');
  });

  document.querySelectorAll('.u-del').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.id;
    if(!confirm('Excluir este usuário?'))return;
    const r=await fetch('/api/users/'+id,{method:'DELETE'});
    const out=await r.json().catch(()=>({}));
    if(!r.ok){msg(out.error||'Falha ao excluir usuário.',true);return}
    await loadUsers();msg('Usuário excluído.');
  });
}

async function createUser(){
  const displayName=$('userName').value.trim();
  const username=$('userLogin').value.trim();
  const password=$('userPassword').value;
  const role=$('userRole').value;
  const r=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName,username,password,role})});
  const out=await r.json().catch(()=>({}));
  if(!r.ok){msg(out.error||'Falha ao criar usuário.',true);return}
  $('userName').value='';$('userLogin').value='';$('userPassword').value='';$('userRole').value='read_only';
  await loadUsers();msg('Usuário criado.');
}
