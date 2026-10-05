const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { installAuth, hashPassword, norm } = require('./auth');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));

const IMPORT_VERSION = 'agenda-v12-2026-10-05';
const USERS_IMPORT_VERSION = 'users-v1-2026-10-05';

function loadSeed(){
  try{
    const statePath = path.join(__dirname, 'current_state.json');
    if(fs.existsSync(statePath)){
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if(data && Array.isArray(data.events)){
        return {
          events: data.events,
          rules: data.rules || {},
          distributors: data.distributors || []
        };
      }
    }
  }catch(e){
    console.error('Falha ao carregar current_state.json:', e.message);
  }
  return {events:[], rules:{}, distributors:[]};
}

const seed = loadSeed();
let memoryState = seed;

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
}) : null;

async function ensureDb(){
  if(!pool) return;

  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS app_imports (
    version text PRIMARY KEY,
    imported_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS app_users (
    id serial PRIMARY KEY,
    username text UNIQUE NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin','operator','read_only')),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`INSERT INTO app_state(id,data) VALUES('main',$1::jsonb) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(seed)]);

  const imported = await pool.query('SELECT 1 FROM app_imports WHERE version=$1', [IMPORT_VERSION]);
  if(imported.rowCount === 0){
    await pool.query(`UPDATE app_state SET data=$1::jsonb, updated_at=now() WHERE id='main'`, [JSON.stringify(seed)]);
    await pool.query('INSERT INTO app_imports(version) VALUES($1)', [IMPORT_VERSION]);
    console.log(`Base ${IMPORT_VERSION} importada com ${seed.events.length} eventos`);
  }

  const usersImported = await pool.query('SELECT 1 FROM app_imports WHERE version=$1', [USERS_IMPORT_VERSION]);
  if(usersImported.rowCount === 0){
    const initialUsers = [
      {
        username:norm(process.env.ADMIN_USERNAME || 'rafael'),
        displayName:'Rafael',
        password:String(process.env.ADMIN_PASSWORD || ''),
        role:'admin'
      },
      {
        username:norm(process.env.OPERATOR_USERNAME || ''),
        displayName:'Operador',
        password:String(process.env.OPERATOR_PASSWORD || ''),
        role:'operator'
      },
      {
        username:norm(process.env.READONLY_USERNAME || ''),
        displayName:(norm(process.env.READONLY_USERNAME || '') === 'diego' ? 'Diego' : 'Consulta'),
        password:String(process.env.READONLY_PASSWORD || ''),
        role:'read_only'
      }
    ].filter(u=>u.username && u.password);

    for(const u of initialUsers){
      await pool.query(
        `INSERT INTO app_users(username,display_name,password_hash,role,active)
         VALUES($1,$2,$3,$4,true)
         ON CONFLICT (username) DO NOTHING`,
        [u.username,u.displayName,hashPassword(u.password),u.role]
      );
    }

    await pool.query('INSERT INTO app_imports(version) VALUES($1)', [USERS_IMPORT_VERSION]);
    console.log(`Usuários iniciais migrados: ${initialUsers.length}`);
  }
}

const { apiAuth, pageAuth, allow } = installAuth(app,{pool,ensureDb});

app.get('/login', (req,res)=>res.sendFile(path.join(__dirname,'login.html')));

app.get('/api/health', async (req,res)=>{
  try{
    await ensureDb();
    if(pool){
      const q = await pool.query(`SELECT jsonb_array_length(data->'events') AS events, updated_at FROM app_state WHERE id='main'`);
      return res.json({ok:true, storage:'postgres', events:Number(q.rows[0]?.events || 0), updatedAt:q.rows[0]?.updated_at || null});
    }
    res.json({ok:true, storage:'memory', events:memoryState.events?.length || 0});
  }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/state', apiAuth, async (req,res)=>{
  try{
    await ensureDb();
    if(pool){
      const q=await pool.query(`SELECT data FROM app_state WHERE id='main'`);
      return res.json(q.rows[0]?.data || seed);
    }
    res.json(memoryState);
  }catch(e){ res.status(500).json({error:'Falha ao carregar a base online'}); }
});

app.post('/api/state', apiAuth, allow('admin','operator'), async (req,res)=>{
  try{
    await ensureDb();
    let incoming=req.body;
    if(!incoming || !Array.isArray(incoming.events)) return res.status(400).json({error:'Estado inválido'});

    if(req.user.role==='operator'){
      const current = pool
        ? (await pool.query(`SELECT data FROM app_state WHERE id='main'`)).rows[0]?.data || seed
        : memoryState;
      incoming = {...current, events:incoming.events};
    }

    memoryState=incoming;
    if(pool){
      await pool.query(`INSERT INTO app_state(id,data,updated_at) VALUES('main',$1::jsonb,now())
        ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [JSON.stringify(incoming)]);
    }
    res.json({ok:true, events:incoming.events.length, storage:pool?'postgres':'memory'});
  }catch(e){ res.status(500).json({error:'Falha ao salvar a base online'}); }
});

app.get('/api/users', apiAuth, allow('admin'), async (req,res)=>{
  try{
    await ensureDb();
    const q=await pool.query(
      `SELECT id,username,display_name AS "displayName",role,active,created_at AS "createdAt",updated_at AS "updatedAt"
       FROM app_users ORDER BY display_name,username`
    );
    res.json(q.rows);
  }catch(e){res.status(500).json({error:'Falha ao carregar usuários'})}
});

app.post('/api/users', apiAuth, allow('admin'), async (req,res)=>{
  try{
    await ensureDb();
    const username=norm(req.body.username);
    const displayName=String(req.body.displayName||'').trim();
    const password=String(req.body.password||'');
    const role=['admin','operator','read_only'].includes(req.body.role)?req.body.role:'read_only';

    if(!username || !displayName) return res.status(400).json({error:'Informe nome e usuário'});
    if(password.length < 8) return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres'});

    const q=await pool.query(
      `INSERT INTO app_users(username,display_name,password_hash,role,active)
       VALUES($1,$2,$3,$4,true)
       RETURNING id,username,display_name AS "displayName",role,active`,
      [username,displayName,hashPassword(password),role]
    );
    res.json(q.rows[0]);
  }catch(e){
    if(e.code==='23505') return res.status(409).json({error:'Este usuário já existe'});
    res.status(500).json({error:'Falha ao criar usuário'});
  }
});

app.put('/api/users/:id', apiAuth, allow('admin'), async (req,res)=>{
  try{
    await ensureDb();
    const id=Number(req.params.id);
    const displayName=String(req.body.displayName||'').trim();
    const role=['admin','operator','read_only'].includes(req.body.role)?req.body.role:'read_only';
    const active=Boolean(req.body.active);
    const password=String(req.body.password||'');

    if(!id || !displayName) return res.status(400).json({error:'Dados inválidos'});
    if(id===req.user.id && (!active || role!=='admin')){
      return res.status(400).json({error:'Você não pode remover seu próprio acesso administrativo'});
    }
    if(password && password.length < 8){
      return res.status(400).json({error:'A senha deve ter pelo menos 8 caracteres'});
    }

    if(password){
      await pool.query(
        `UPDATE app_users SET display_name=$1,role=$2,active=$3,password_hash=$4,updated_at=now() WHERE id=$5`,
        [displayName,role,active,hashPassword(password),id]
      );
    }else{
      await pool.query(
        `UPDATE app_users SET display_name=$1,role=$2,active=$3,updated_at=now() WHERE id=$4`,
        [displayName,role,active,id]
      );
    }
    res.json({ok:true});
  }catch(e){res.status(500).json({error:'Falha ao atualizar usuário'})}
});

app.delete('/api/users/:id', apiAuth, allow('admin'), async (req,res)=>{
  try{
    await ensureDb();
    const id=Number(req.params.id);
    if(id===req.user.id) return res.status(400).json({error:'Você não pode excluir seu próprio usuário'});
    await pool.query('DELETE FROM app_users WHERE id=$1',[id]);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:'Falha ao excluir usuário'})}
});

app.get('/gestao', pageAuth, (req,res)=>{
  if(req.user.role==='read_only') return res.redirect('/');
  res.sendFile(path.join(__dirname,'gestao.html'));
});

app.get('/', pageAuth, (req,res)=>res.sendFile(path.join(__dirname,'executive.html')));

for(const f of ['gestao.css','g1.js','g2.js','g3.js','g4.js']){
  app.get('/'+f, pageAuth, (req,res)=>res.sendFile(path.join(__dirname,f)));
}

app.use(pageAuth, express.static(__dirname, { extensions:['html'] }));
app.get('*', pageAuth, (req,res)=>res.sendFile(path.join(__dirname,'executive.html')));

const port=process.env.PORT || 10000;
app.listen(port, ()=>console.log(`Agenda online na porta ${port} com ${seed.events.length} eventos no pacote atual`));