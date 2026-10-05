const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { installAuth, apiAuth, pageAuth, allow } = require('./auth');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));
installAuth(app);

const IMPORT_VERSION = 'agenda-v12-2026-10-05';

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
  await pool.query(`INSERT INTO app_state(id,data) VALUES('main',$1::jsonb) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(seed)]);

  const imported = await pool.query('SELECT 1 FROM app_imports WHERE version=$1', [IMPORT_VERSION]);
  if(imported.rowCount === 0){
    await pool.query(`UPDATE app_state SET data=$1::jsonb, updated_at=now() WHERE id='main'`, [JSON.stringify(seed)]);
    await pool.query('INSERT INTO app_imports(version) VALUES($1)', [IMPORT_VERSION]);
    console.log(`Base ${IMPORT_VERSION} importada com ${seed.events.length} eventos`);
  }
}

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

    if(req.session.user.role==='operator'){
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

app.get('/gestao', pageAuth, (req,res)=>{
  if(req.session.user.role==='read_only') return res.redirect('/');
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