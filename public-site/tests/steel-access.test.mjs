import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {steelAccess} from '../lib/steel-access.ts';

const fixtureKey='independent-fixture-key-2026';
const site='https://test.example';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE steel_sessions (token_hash TEXT PRIMARY KEY, client TEXT NOT NULL, expires_at INTEGER NOT NULL); CREATE TABLE steel_attempts (identity TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
 function statement(query,args=[]){
  return {bind(...values){return statement(query,values);},
   async first(){return sql.prepare(query).get(...args)||null;},
   async run(){return sql.prepare(query).run(...args);},
   execute(){const prepared=sql.prepare(query);return prepared.columns().length?{results:prepared.all(...args)}:{results:[],meta:prepared.run(...args)};}};
 }
 const DB={prepare:query=>statement(query),async batch(statements){
  sql.exec('BEGIN');try{const results=statements.map(s=>s.execute());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 const salt=randomBytes(16);
 const env={DB,STEEL_KEY_SALT:salt.toString('base64'),STEEL_KEY_HASH:pbkdf2Sync(fixtureKey,salt,100000,32,'sha256').toString('base64'),STEEL_PEPPER:randomBytes(32).toString('base64'),STEEL_ASSET_KEY:randomBytes(32).toString('base64')};
 return {sql,env};
}
function request(path,options={}){
 const headers=new Headers({Origin:site,'CF-Connecting-IP':'192.0.2.1',...options.headers});
 const init={method:options.method||'GET',headers};
 if(options.body!==undefined){headers.set('Content-Type','application/json');init.body=JSON.stringify(options.body);}
 return new Request(site+'/api/steel/'+path,init);
}
async function result(env,path,options){const response=await steelAccess(request(path,options),env);return {response,body:await response.json()};}
async function unlockWeb(env){return result(env,'unlock',{method:'POST',body:{key:fixtureKey,client:'web'}});}
function cookieHeader(response){return response.headers.get('set-cookie').split(';')[0];}

test('missing configuration returns unavailable without exposing secrets',async()=>{
 const {env,sql}=fixture();try{const value=await result({...env,STEEL_KEY_HASH:''},'unlock',{method:'POST',body:{key:fixtureKey}});assert.equal(value.response.status,503);assert.ok(!JSON.stringify(value.body).includes(fixtureKey));}finally{sql.close();}
});
test('missing, malformed and incorrect keys cannot unlock or read the encryption key',async()=>{
 const {env,sql}=fixture();try{
  for(const key of [undefined,42,'']){const value=await result(env,'unlock',{method:'POST',body:{key}});assert.equal(value.response.status,400);assert.equal(value.response.headers.get('set-cookie'),null);}
  const wrong=await result(env,'unlock',{method:'POST',body:{key:'wrong-fixture-key'}});assert.equal(wrong.response.status,401);
  const key=await result(env,'key');assert.equal(key.response.status,401);assert.ok(!JSON.stringify(key.body).includes(env.STEEL_ASSET_KEY));
  const state=await result(env,'session');assert.equal(state.body.unlocked,false);
 }finally{sql.close();}
});
test('web unlock uses HttpOnly Secure cookie, no returned token, 24 hour expiration and hashed database token',async()=>{
 const {env,sql}=fixture();try{
  const before=Math.floor(Date.now()/1000),value=await unlockWeb(env);assert.equal(value.response.status,200);assert.equal(value.body.unlocked,true);
  assert.equal(value.body.token,undefined);assert.equal(value.body.key,undefined);assert.ok(!JSON.stringify(value.body).includes(fixtureKey));
  const cookie=value.response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=86400/);assert.match(cookie,/Path=\/api\/steel/);
  const token=cookieHeader(value.response).split('=')[1];const row=sql.prepare('SELECT * FROM steel_sessions').get();assert.notEqual(row.token_hash,token);assert.equal(row.client,'web');assert.ok(row.expires_at>=before+86400&&row.expires_at<=before+86401);
  const headers={Cookie:cookieHeader(value.response)};
  const state=await result(env,'session',{headers});assert.equal(state.body.unlocked,true);
  const key=await result(env,'key',{headers});assert.equal(key.response.status,200);assert.equal(key.body.key,env.STEEL_ASSET_KEY);assert.match(key.response.headers.get('cache-control'),/no-store/);
 }finally{sql.close();}
});
test('Android origin gets a bearer token; only its bearer can authorize Android session',async()=>{
 const {env,sql}=fixture();try{
  const nativeHeaders={Origin:'https://localhost'};
  const unlocked=await result(env,'unlock',{method:'POST',headers:nativeHeaders,body:{key:fixtureKey,client:'android'}});
  assert.equal(unlocked.response.status,200);assert.match(unlocked.body.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(unlocked.response.headers.get('set-cookie'),null);assert.equal(unlocked.response.headers.get('access-control-allow-origin'),'https://localhost');
  const headers={...nativeHeaders,Authorization:'Bearer '+unlocked.body.token};
  assert.equal((await result(env,'session',{headers})).body.unlocked,true);assert.equal((await result(env,'key',{headers})).response.status,200);
  const confused=await result(env,'key',{headers:{Cookie:'steel_access='+unlocked.body.token}});assert.equal(confused.response.status,401);
  const preflight=await steelAccess(request('unlock',{method:'OPTIONS',headers:nativeHeaders}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://localhost');
 }finally{sql.close();}
});
test('web token cannot authorize a native bearer session, and lock revokes a session',async()=>{
 const {env,sql}=fixture();try{
  const unlocked=await unlockWeb(env),cookie=cookieHeader(unlocked.response),token=cookie.split('=')[1];
  assert.equal((await result(env,'key',{headers:{Origin:'https://localhost',Authorization:'Bearer '+token}})).response.status,401);
  const locked=await result(env,'lock',{method:'POST',headers:{Cookie:cookie}});assert.equal(locked.response.status,200);assert.equal(locked.body.unlocked,false);assert.match(locked.response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await result(env,'key',{headers:{Cookie:cookie}})).response.status,401);
 }finally{sql.close();}
});
test('desktop loopback origin can unlock and foreign localhost-like origins are rejected',async()=>{
 const {env,sql}=fixture();try{
  const headers={Origin:'http://localhost:53721'};
  const unlocked=await result(env,'unlock',{method:'POST',headers,body:{key:fixtureKey,client:'android'}});
  assert.equal(unlocked.response.status,200);assert.equal(unlocked.response.headers.get('access-control-allow-origin'),headers.Origin);
  assert.equal((await result(env,'key',{headers:{...headers,Authorization:'Bearer '+unlocked.body.token}})).response.status,200);
  for(const origin of ['http://localhost.attacker.example:53721','http://attacker.example:53721'])assert.equal((await result(env,'unlock',{method:'POST',headers:{Origin:origin},body:{key:fixtureKey,client:'android'}})).response.status,403);
 }finally{sql.close();}
});
test('expired sessions do not authorize even when the caller keeps a token',async()=>{
 const {env,sql}=fixture();try{
  const unlocked=await unlockWeb(env),headers={Cookie:cookieHeader(unlocked.response)};sql.prepare('UPDATE steel_sessions SET expires_at=?').run(Math.floor(Date.now()/1000)-1);
  assert.equal((await result(env,'session',{headers})).body.unlocked,false);assert.equal((await result(env,'key',{headers})).response.status,401);
 }finally{sql.close();}
});
test('distributed rate state rejects sixth attempt and permits a new window',async()=>{
 const {env,sql}=fixture();try{
  for(let attempt=1;attempt<=5;attempt++)assert.equal((await result(env,'unlock',{method:'POST',body:{key:'wrong-fixture-key'}})).response.status,401);
  const blocked=await unlockWeb(env);assert.equal(blocked.response.status,429);assert.ok(Number(blocked.response.headers.get('retry-after'))>0);
  const row=sql.prepare('SELECT * FROM steel_attempts').get();assert.equal(row.attempts,6);assert.ok(!row.identity.includes('192.0.2.1'));
  sql.prepare('UPDATE steel_attempts SET reset_at=?').run(Math.floor(Date.now()/1000)-1);
  assert.equal((await unlockWeb(env)).response.status,200);assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM steel_attempts').get().count,0);
 }finally{sql.close();}
});
test('foreign browser origin is rejected and cannot trigger PBKDF2 or create sessions',async()=>{
 const {env,sql}=fixture();try{
  const rejected=await result(env,'unlock',{method:'POST',headers:{Origin:'https://attacker.example'},body:{key:fixtureKey}});assert.equal(rejected.response.status,403);assert.equal(rejected.response.headers.get('access-control-allow-origin'),null);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM steel_sessions').get().count,0);assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM steel_attempts').get().count,0);
 }finally{sql.close();}
});
test('successful unlock cleanup removes expired rows while preserving unrelated active rows',async()=>{
 const {env,sql}=fixture();try{
  const now=Math.floor(Date.now()/1000);
  sql.prepare('INSERT INTO steel_sessions VALUES (?,?,?)').run('expired-fixture-hash','web',now-1);
  sql.prepare('INSERT INTO steel_sessions VALUES (?,?,?)').run('active-fixture-hash','android',now+3600);
  sql.prepare('INSERT INTO steel_attempts VALUES (?,?,?)').run('expired-fixture-identity',4,now-1);
  sql.prepare('INSERT INTO steel_attempts VALUES (?,?,?)').run('active-fixture-identity',3,now+900);
  assert.equal((await unlockWeb(env)).response.status,200);
  assert.equal(sql.prepare('SELECT * FROM steel_sessions WHERE token_hash=?').get('expired-fixture-hash'),undefined);
  assert.equal(sql.prepare('SELECT * FROM steel_sessions WHERE token_hash=?').get('active-fixture-hash').client,'android');
  assert.equal(sql.prepare('SELECT * FROM steel_attempts WHERE identity=?').get('expired-fixture-identity'),undefined);
  assert.equal(sql.prepare('SELECT * FROM steel_attempts WHERE identity=?').get('active-fixture-identity').attempts,3);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM steel_sessions').get().count,2);
 }finally{sql.close();}
});
