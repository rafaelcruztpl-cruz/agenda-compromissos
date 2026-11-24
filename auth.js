const session=require('express-session');
const crypto=require('crypto');

function norm(v){return String(v||'').trim().toLowerCase();}

function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return salt+':'+hash;
}

function verifyPassword(password,stored){
  try{
    const [salt,hex]=String(stored||'').split(':');
    if(!salt||!hex)return false;
    const actual=crypto.scryptSync(String(password),salt,64);
    const expected=Buffer.from(hex,'hex');
    return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
  }catch(e){return false}
}

function bootstrapUser(){
  return {id:0,username:'bootstrap',role:'admin',displayName:'Administrador'};
}
function envUsers(){
  return [
    {username:norm(process.env.ADMIN_USERNAME||'rafael'),password:String(process.env.ADMIN_PASSWORD||''),role:'admin',displayName:'Rafael'},
    {username:norm(process.env.OPERATOR_USERNAME||''),password:String(process.env.OPERATOR_PASSWORD||''),role:'operator',displayName:'Operador'},
    {username:norm(process.env.READONLY_USERNAME||''),password:String(process.env.READONLY_PASSWORD||''),role:'read_only',displayName:norm(process.env.READONLY_USERNAME)==='diego'?'Diego':'Consulta'}
  ].filter(u=>u.username&&u.password);
}

function installAuth(app,{pool,ensureDb}){
  app.set('trust proxy',1);
  app.use(session({
    secret:process.env.SESSION_SECRET||process.env.ADMIN_PASSWORD||'bootstrap-only',
    resave:false,
    saveUninitialized:false,
    cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}
  }));

  async function currentUser(req){
    if(req.session.user)return req.session.user;
    if(!pool)return null;
    try{
      await ensureDb();
      if(!req.session.userId)return null;
      const q=await pool.query('SELECT id,username,display_name,role,active FROM app_users WHERE id=$1',[req.session.userId]);
      const u=q.rows[0];
      if(!u||!u.active)return null;
      return {id:u.id,username:u.username,displayName:u.display_name,role:u.role};
    }catch(e){
      return null;
    }
  }

  app.post('/api/auth/login',async(req,res)=>{
    try{
      const username=norm(req.body.username);
      const password=String(req.body.password||'');
      if(pool){
        try{
          await ensureDb();
          const q=await pool.query('SELECT * FROM app_users WHERE username=$1',[username]);
          const u=q.rows[0];
          if(u&&u.active&&verifyPassword(password,u.password_hash)){
            req.session.userId=u.id;
            return res.json({ok:true,user:{id:u.id,username:u.username,displayName:u.display_name,role:u.role}});
          }
        }catch(e){}
      }
      const envUser=envUsers().find(u=>u.username===username&&u.password===password);
      if(!envUser)return res.status(401).json({error:'Usuário ou senha inválidos'});
      req.session.user={username:envUser.username,role:envUser.role,displayName:envUser.displayName};
      res.json({ok:true,user:req.session.user,fallback:true});
    }catch(e){res.status(500).json({error:'Falha ao entrar'})}
  });

  app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

  app.get('/api/auth/me',async(req,res)=>{
    try{
      const u=await currentUser(req);
      if(!u)return res.status(401).json({error:'Não autenticado'});
      res.json(u);
    }catch(e){res.status(500).json({error:'Falha de autenticação'})}
  });

  async function apiAuth(req,res,next){
    try{
      const u=await currentUser(req);
      if(!u)return res.status(401).json({error:'Não autenticado'});
      req.user=u;
      next();
    }catch(e){res.status(500).json({error:'Falha de autenticação'})}
  }

  async function pageAuth(req,res,next){
    try{
      const u=await currentUser(req);
      if(!u)return res.redirect('/login');
      req.user=u;
      next();
    }catch(e){res.redirect('/login')}
  }

  function allow(...roles){
    return (req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({error:'Acesso não autorizado'});
  }

  return {apiAuth,pageAuth,allow,hashPassword};
}

module.exports={installAuth,hashPassword,norm};
