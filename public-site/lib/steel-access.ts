export type SteelEnv = {DB:D1Database; STEEL_KEY_SALT:string; STEEL_KEY_HASH:string; STEEL_PEPPER:string; STEEL_ASSET_KEY:string};
const encoder=new TextEncoder();
const nativeOrigins=new Set(['https://localhost','http://localhost','capacitor://localhost']);
const duration=24*60*60;
const rateWindow=15*60;
const cookieName='steel_access';
function fromBase64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function base64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
async function digest(value:string){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
async function rateIdentity(request:Request,env:SteelEnv){
 const ip=request.headers.get('cf-connecting-ip')||'local-preview';
 const key=await crypto.subtle.importKey('raw',fromBase64(env.STEEL_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(ip))));
}
function credentials(request:Request){
 const bearer=request.headers.get('authorization');
 if(bearer?.startsWith('Bearer '))return {token:bearer.slice(7),client:'android'};
 const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 return {token:token||'',client:'web'};
}
async function session(request:Request,env:SteelEnv,now:number){
 const {token,client}=credentials(request);
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const row=await env.DB.prepare('SELECT token_hash,expires_at,client FROM steel_sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token),now).first<{token_hash:string,expires_at:number,client:string}>();
 return row?.client===client?row:null;
}
export async function steelAccess(request:Request,env:SteelEnv):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/api/steel/'))return null;
 const origin=request.headers.get('origin');
 const localPreview=(url.hostname==='127.0.0.1'||url.hostname==='localhost');
 const native=!!origin&&(nativeOrigins.has(origin)||/^http:\/\/localhost:\d{1,5}$/.test(origin));
 const sameOrigin=!origin||origin===url.origin;
 const cors:Record<string,string>={'Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(native){cors['Access-Control-Allow-Origin']=origin!;cors['Access-Control-Allow-Headers']='Content-Type, Authorization';cors['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
 const json=(body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8',...extra}});
 if(!sameOrigin&&!native)return json({message:'请求来源不受支持'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!env.DB||!env.STEEL_KEY_HASH||!env.STEEL_KEY_SALT||!env.STEEL_PEPPER||!env.STEEL_ASSET_KEY)return json({message:'解锁服务暂时不可用，请稍后重试'},503);
 const now=Math.floor(Date.now()/1000);
 const cookie=(token:string,maxAge:number)=>`${cookieName}=${token}; Path=/api/steel; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${localPreview?'':'; Secure'}`;
 try {
  if(url.pathname==='/api/steel/unlock'&&request.method==='POST'){
   if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({message:'请求格式不正确'},415);
   // Reject before allocating a large body. The key never enters URLs or logs.
   if(Number(request.headers.get('content-length')||0)>1024)return json({message:'请求过大'},413);
   const raw=await request.text();if(raw.length>1024)return json({message:'请求过大'},413);
   let body:{key?:unknown,client?:unknown};try{body=JSON.parse(raw);}catch{return json({message:'请求格式不正确'},400);}
   if(typeof body.key!=='string'||body.key.length<1||body.key.length>128)return json({message:'请输入密钥'},400);
   const client=native?'android':'web';
   if(body.client&&body.client!==client)return json({message:'客户端类型不正确'},400);
   const identity=await rateIdentity(request,env);
   const result=await env.DB.batch([
    env.DB.prepare('INSERT INTO steel_attempts (identity,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(identity) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').bind(identity,now+rateWindow,now,now),
    env.DB.prepare('SELECT attempts,reset_at FROM steel_attempts WHERE identity=?').bind(identity)
   ]);
   const rate=result[1].results[0] as {attempts:number,reset_at:number};
   if(rate.attempts>5)return json({message:'尝试次数过多，请 15 分钟后再试'},429,{'Retry-After':String(Math.max(1,rate.reset_at-now))});
   const material=await crypto.subtle.importKey('raw',encoder.encode(body.key),'PBKDF2',false,['deriveBits']);
   const hash=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromBase64(env.STEEL_KEY_SALT),iterations:100000,hash:'SHA-256'},material,256));
   const expected=fromBase64(env.STEEL_KEY_HASH);let difference=hash.length^expected.length;
   for(let i=0;i<hash.length;i++)difference|=hash[i]^(expected[i]??0);
   if(difference!==0)return json({message:'密钥不正确，请重新输入'},401);
   const token=base64url(crypto.getRandomValues(new Uint8Array(32)));
   const expiresAt=now+duration;
   await env.DB.batch([
    env.DB.prepare('INSERT INTO steel_sessions (token_hash,client,expires_at) VALUES (?,?,?)').bind(await digest(token),client,expiresAt),
    env.DB.prepare('DELETE FROM steel_attempts WHERE identity=?').bind(identity),
    env.DB.prepare('DELETE FROM steel_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM steel_attempts WHERE reset_at<=?').bind(now)
   ]);
   return json({unlocked:true,expiresAt:expiresAt*1000,...(native?{token}:{})},200,native?{}:{'Set-Cookie':cookie(token,duration)});
  }
  const active=await session(request,env,now);
  if(url.pathname==='/api/steel/session'&&request.method==='GET')return json({unlocked:!!active,expiresAt:active?active.expires_at*1000:0});
  if(url.pathname==='/api/steel/key'&&request.method==='GET'){
   if(!active)return json({message:'请先输入密钥解锁铸钢'},401);
   return json({key:env.STEEL_ASSET_KEY,expiresAt:active.expires_at*1000});
  }
  if(url.pathname==='/api/steel/lock'&&request.method==='POST'){
   if(!native&&origin!==url.origin)return json({message:'请求来源不受支持'},403);
   if(active)await env.DB.prepare('DELETE FROM steel_sessions WHERE token_hash=?').bind(active.token_hash).run();
   return json({unlocked:false},200,native?{}:{'Set-Cookie':cookie('',0)});
  }
  return json({message:'接口不存在'},404);
 }catch{
  // Do not log request bodies, keys, tokens, or environment values.
  console.error('Steel access backend unavailable');
  return json({message:'解锁服务暂时不可用，请稍后重试'},503);
 }
}
