import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAccountDatabase} from '../lib/accounts/database.mjs';
import {createIdentity} from '../lib/accounts/identity.mjs';
import {createHostedServer} from '../lib/accounts/http.mjs';

const original='My original password 2026';
const changed='My changed password 2026';
const nonce=()=>randomUUID()+randomUUID();

test('password registration, sign-in, purpose-bound reset and session revocation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'qinban-passwords-'));
 const db=await createAccountDatabase({directory:join(dir,'pg')}),mail=[];
 let clock=Date.now();
 const identity=createIdentity({db,secret:'password-test-secret'.repeat(4),mailer:async m=>mail.push(m),now:()=>clock});
 t.after(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});
 async function challenge(email,purpose='login',n=nonce()){
  const c=await identity.code({email,purpose,nonce:n});
  return {challengeId:c.challengeId,code:mail.find(m=>m.challengeId===c.challengeId)?.code,nonce:n};
 }
 async function signup(email,password=original){
  await identity.invite(email);
  return identity.verify({...await challenge(email),...(password?{newPassword:password}:{})});
 }
 let first,second;
 await t.test('new verified registrations store only a salted scrypt hash',async()=>{
  first=await signup('piano@example.test');
  assert.equal(first.isNewAccount,true);
  const rows=await db.identity(tx=>tx.query('SELECT * FROM qinban_identity.passwords'));
  assert.match(rows.rows[0].password_hash,/^scrypt-v1\$/);
  assert.equal(JSON.stringify(rows).includes(original),false);
  assert.equal(JSON.stringify(first).includes('password_hash'),false);
  await assert.rejects(db.private(first.session.userId,tx=>tx.query('SELECT * FROM qinban_identity.passwords')),/permission denied/);
 });
 await t.test('password sign-in supports remembered versus one-day sessions',async()=>{
  second=await identity.passwordLogin({email:'PIANO@example.test',password:original});
  assert.equal(Date.parse(second.session.expiresAt)-clock,86400000);
  assert.equal(second.session.reauthenticatedAt,null,'password login does not impersonate a recent email verification');
  const remembered=await identity.passwordLogin({email:'piano@example.test',password:original,remember:true});
  assert.equal(Date.parse(remembered.session.expiresAt)-clock,30*86400000);
 });
 await t.test('wrong passwords, unknown emails and accounts without passwords give the same error',async()=>{
  await signup('code-only@example.test',null);
  for(const[email,password]of[['piano@example.test','wrong'],['unknown@example.test',original],['code-only@example.test',original]])
   await assert.rejects(identity.passwordLogin({email,password}),e=>e.code==='INVALID_CREDENTIALS'&&e.message==='邮箱或密码不正确。');
 });
 await t.test('an existing account cannot change its password with an ordinary sign-in code',async()=>{
  clock+=61000;
  const c=await challenge('piano@example.test');
  await assert.rejects(identity.verify({...c,newPassword:changed}),e=>e.code==='INVALID_CODE');
  await identity.passwordLogin({email:'piano@example.test',password:original});
 });
 let reset;
 await t.test('reset requests for unknown accounts send no email and cannot create an account',async()=>{
  const before=mail.length,c=await challenge('not-registered@example.test','password');
  assert.equal(mail.length,before);
  await assert.rejects(identity.verify({...c,code:'12345678',newPassword:changed,expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
 });
 await t.test('reset codes cannot be exchanged as sign-in codes or used from a different browser',async()=>{
  reset=await challenge('piano@example.test','password');
  await assert.rejects(identity.verify(reset),e=>e.code==='INVALID_CODE');
  await assert.rejects(identity.verify({...reset,nonce:nonce(),newPassword:changed,expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
  const wrong=reset.code==='00000000'?'11111111':'00000000';
  await assert.rejects(identity.verify({...reset,code:wrong,newPassword:changed,expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
  await assert.rejects(identity.verify({...reset,newPassword:'short',expectedPurpose:'password'}),e=>e.code==='INVALID_PASSWORD');
 });
 let resetSession;
 await t.test('a verified reset rotates the password and revokes all old sessions and outstanding codes',async()=>{
  clock+=61000;
  const oldLogin=await challenge('piano@example.test');
  resetSession=await identity.verify({...reset,newPassword:changed,expectedPurpose:'password'});
  assert.equal(resetSession.isNewAccount,false);
  for(const token of [first.token,second.token])await assert.rejects(identity.session(token),e=>e.code==='SESSION_REQUIRED');
  await assert.rejects(identity.passwordLogin({email:'piano@example.test',password:original}),e=>e.code==='INVALID_CREDENTIALS');
  await identity.passwordLogin({email:'piano@example.test',password:changed});
  await assert.rejects(identity.verify(oldLogin),e=>e.code==='INVALID_CODE');
  await assert.rejects(identity.verify({...reset,newPassword:'Another safe password',expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
  assert.equal((await identity.session(resetSession.token)).email,'piano@example.test');
 });
 await t.test('an existing code-only account can set its first password through email verification',async()=>{
  const c=await challenge('code-only@example.test','password');
  await identity.verify({...c,newPassword:original,expectedPurpose:'password'});
  await identity.passwordLogin({email:'code-only@example.test',password:original});
 });
 await t.test('expired codes and five failed attempts cannot reset passwords',async()=>{
  let c=await challenge('code-only@example.test','password');clock+=600001;
  await assert.rejects(identity.verify({...c,newPassword:changed,expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
  c=await challenge('code-only@example.test','password');
  for(let i=0;i<5;i++)await assert.rejects(identity.verify({...c,code:c.code==='00000000'?'11111111':'00000000',newPassword:changed,expectedPurpose:'password'}));
  await assert.rejects(identity.verify({...c,newPassword:changed,expectedPurpose:'password'}),e=>e.code==='INVALID_CODE');
 });
 await t.test('password failures are rate-limited and the limit survives failed transactions',async()=>{
  for(let i=0;i<10;i++)await assert.rejects(identity.passwordLogin({email:'guess@example.test',password:'incorrect',ip:'guessing-ip'}),e=>e.code==='INVALID_CREDENTIALS');
  await assert.rejects(identity.passwordLogin({email:'guess@example.test',password:'incorrect',ip:'guessing-ip'}),e=>e.status===429);
 });
 await t.test('HTTP password and reset routes enforce CSRF and issue private, session-only cookies',async()=>{
  const server=createHostedServer({identity});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
   const context=await fetch(base+'/api/v1/auth/context'),cookie=context.headers.getSetCookie()[0].split(';')[0],csrf=(await context.json()).csrfToken;
   const req=(path,body,token=csrf)=>fetch(base+'/api/v1'+path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token,cookie,origin:base},body:JSON.stringify(body)});
   assert.equal((await req('/auth/password',{email:'piano@example.test',password:changed},'forged')).status,403);
   const signed=await req('/auth/password',{email:'piano@example.test',password:changed});
   assert.equal(signed.status,200);
   const sessionCookie=signed.headers.getSetCookie()[0];
   assert.match(sessionCookie,/HttpOnly; SameSite=Lax; Path=\//);assert.doesNotMatch(sessionCookie,/Max-Age/);
   clock+=900001;
   const sent=await req('/auth/code',{email:'piano@example.test',purpose:'password'}),c=await sent.json();
   assert.equal(sent.status,202);
   const payload={challengeId:c.challengeId,code:mail.find(m=>m.challengeId===c.challengeId).code,password:original};
   assert.equal((await req('/auth/verify',payload)).status,422,'reset codes are rejected by the ordinary verification endpoint');
   const done=await req('/auth/password/reset',payload);
   assert.equal(done.status,200);
   assert.equal((await done.json()).user.email,'piano@example.test');
  }finally{await new Promise(r=>server.close(r));}
 });
 await t.test('a racing login cannot mint a valid session using the password being reset',async()=>{
  clock+=900001;
  const c=await challenge('piano@example.test','password');
  const [login,reset]=await Promise.allSettled([
   identity.passwordLogin({email:'piano@example.test',password:original}),
   identity.verify({...c,newPassword:changed,expectedPurpose:'password'})
  ]);
  assert.equal(reset.status,'fulfilled');
  if(login.status==='fulfilled')await assert.rejects(identity.session(login.value.token),e=>e.code==='SESSION_REQUIRED');
  else assert.equal(login.reason.code,'INVALID_CREDENTIALS');
  await identity.passwordLogin({email:'piano@example.test',password:changed});
 });
 await t.test('disabled and deletion-pending accounts cannot use password login',async()=>{
  await db.identity(tx=>tx.query("UPDATE qinban_identity.users SET state='disabled' WHERE id=$1",[first.session.userId]));
  await assert.rejects(identity.passwordLogin({email:'piano@example.test',password:changed}),e=>e.code==='INVALID_CREDENTIALS');
  await db.identity(tx=>tx.query("UPDATE qinban_identity.users SET state='deletion_pending',delete_after=$2 WHERE id=$1",[first.session.userId,new Date(clock+86400000).toISOString()]));
  await assert.rejects(identity.passwordLogin({email:'piano@example.test',password:changed}),e=>e.code==='INVALID_CREDENTIALS');
 });
});
