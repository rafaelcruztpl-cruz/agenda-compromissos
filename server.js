const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '8mb' }));
const seed = {events:[], rules:{}, distributors:[]};
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
  await pool.query(`INSERT INTO app_state(id,data) VALUES('main',$1::jsonb) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(seed)]);
}

app.get('/api/health', async (req,res)=>{
  try{
    if(pool){ await ensureDb(); await pool.query('SELECT 1'); }
    res.json({ok:true, storage:pool?'postgres':'memory'});
  }catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/state', async (req,res)=>{
  try{
    if(pool){
      await ensureDb();
      const q=await pool.query(`SELECT data FROM app_state WHERE id='main'`);
      return res.json(q.rows[0]?.data || seed);
    }
    res.json(memoryState);
  }catch(e){ res.status(500).json({error:'Falha ao carregar a base online'}); }
});

app.post('/api/state', async (req,res)=>{
  try{
    const state=req.body;
    if(!state || !Array.isArray(state.events)) return res.status(400).json({error:'Estado inválido'});
    memoryState=state;
    if(pool){
      await ensureDb();
      await pool.query(`INSERT INTO app_state(id,data,updated_at) VALUES('main',$1::jsonb,now())
        ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [JSON.stringify(state)]);
    }
    res.json({ok:true, events:state.events.length, storage:pool?'postgres':'memory'});
  }catch(e){ res.status(500).json({error:'Falha ao salvar a base online'}); }
});

app.use(express.static(__dirname, { extensions:['html'] }));
app.get('/gestao', (req,res)=>res.sendFile(path.join(__dirname,'gestao.html')));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'index.html')));

const port=process.env.PORT || 10000;
app.listen(port, ()=>console.log(`Agenda online na porta ${port}`));