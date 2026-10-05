const session=require('express-session');

function norm(v){return String(v||'').trim().toLowerCase();}

function buildUsers(){
  return [
    {username:norm(process.env.ADMIN_USERNAME||'rafael'),password:String(process.env.ADMIN_PASSWORD||''),role:'admin',displayName:'Rafael'},
    {username:norm(process.env.OPERATOR_USERNAME||''),password:String(process.env.OPERATOR_PASSWORD||''),role:'operator',displayName:'Operador'},
    {username:norm(process.env.READONLY_USERNAME||''),password:String(process.env.READONLY_PASSWORD||''),role:'read_only',displayName:'Consulta'}
  ].filter(x=>x.username&&x.password);
}

function authConfigured(){return buildUsers().length>0}\n\nfunction bootstrapUser(){return {username:'bootstrap',role:'admin',displayName:'Administrador'}}\n\nfunction installAuth(app){
  app.set('trust proxy',1);
  app.use(session({
    secret:process.env.SESSION_SECRET||process.env.ADMIN_PASSWORD||'bootstrap-only',
    resave:false,
    saveUninitialized:false,
    cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}
  }));

  app.post('/api/auth/login',(req,res)=>{
    const u=norm(req.body.username),p=String(req.body.password||'');
    const user=buildUsers().find(x=>x.username===u&&x.password===p);
    if(!user)return res.status(401).json({error:'Usuário ou senha inválidos'});
    req.session.user={username:user.username,role:user.role,displayName:user.displayName};
    res.json({ok:true,user:req.session.user});
  });

  app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
  app.get('/api/auth/me',(req,res)=>{
    if(!req.session.user)return res.status(401).json({error:'Não autenticado'});
    res.json(req.session.user);
  });
}

function apiAuth(req,res,next){
  if(!req.session.user)return res.status(401).json({error:'Não autenticado'});
  next();
}
function pageAuth(req,res,next){
  if(!req.session.user)return res.redirect('/login');
  next();
}
function allow(...roles){
  return (req,res,next)=>roles.includes(req.session.user?.role)?next():res.status(403).json({error:'Acesso não autorizado'});
}

module.exports={installAuth,apiAuth,pageAuth,allow};
