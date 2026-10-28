import {mkdir,readFile,writeFile,open,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import nodemailer from 'nodemailer';
import {createAccountDatabase} from './database.mjs';
import {createIdentity} from './identity.mjs';
import {createPrivateFiles} from './storage.mjs';
import {createPrivateLibrary} from './private-library.mjs';
import {createPrivateTransfers} from './transfers.mjs';
import {maintainAccounts} from './maintenance.mjs';
import {createHostedServer} from './http.mjs';
import {createHostedRecognitionProvider} from './recognition-provider.mjs';
import {createRecognitionSources} from './recognition-source.mjs';
import {createHostedRecognition} from './recognition-jobs.mjs';
import {createCommercialOperations} from './operations.mjs';
import {createSubscriptions} from './subscriptions.mjs';
import {loadPaymentGateways} from './payment-gateways.mjs';

export async function createHostedRuntime({directory=resolve(process.env.QINBAN_ACCOUNT_DIR||'.local/accounts-v1'),profile=process.env.QINBAN_ACCOUNT_PROFILE||'local',port=Number(process.env.QINBAN_ACCOUNT_PORT)||8793,distDir=resolve('dist-hosted'),mailer:injectedMailer,recognitionProvider,paymentGateways}={}){
 const local=profile==='local';if(!['local','production'].includes(profile))throw Error('Unknown account profile');
 if(!local&&(!process.env.QINBAN_PUBLIC_ORIGIN?.startsWith('https://')||!process.env.QINBAN_ACCOUNT_SECRET||!process.env.QINBAN_SMTP_URL||!process.env.QINBAN_MAIL_FROM))throw Error('Production requires HTTPS origin, secret and configured transactional mail');
 await mkdir(directory,{recursive:true,mode:0o700});
 const lockPath=join(directory,'runtime.lock');let lock;
 try{lock=await open(lockPath,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;const old=Number(await readFile(lockPath,'utf8').catch(()=>0));let live=false;try{if(old>0){process.kill(old,0);live=true}}catch(error){if(error.code!=='ESRCH')live=true}if(live)throw Error('Account database already open; stop the running account instance before using maintenance commands');await rm(lockPath,{force:true});lock=await open(lockPath,'wx',0o600)}
 await lock.writeFile(String(process.pid));
 let db;
 try{
  let secret=process.env.QINBAN_ACCOUNT_SECRET;
  if(local&&!secret){const p=join(directory,'secret');try{secret=await readFile(p,'utf8')}catch(e){if(e.code!=='ENOENT')throw e;secret=randomBytes(48).toString('base64url');await writeFile(p,secret,{mode:0o600,flag:'wx'})}}
  db=await createAccountDatabase(local?{directory:join(directory,'postgres')}:{authUrl:process.env.QINBAN_AUTH_DATABASE_URL,libraryUrl:process.env.QINBAN_LIBRARY_DATABASE_URL});
  const mailboxDirectory=join(directory,'development-mailbox');
  const transport=!local&&!injectedMailer?nodemailer.createTransport(process.env.QINBAN_SMTP_URL,{from:process.env.QINBAN_MAIL_FROM}):null;
  const mailer=injectedMailer||(local?async message=>{await mkdir(mailboxDirectory,{recursive:true,mode:0o700});await writeFile(join(mailboxDirectory,message.challengeId+'.json'),JSON.stringify({...message,profile:'local-validation',notice:'未发送真实邮件；仅供本机验证'},null,2),{mode:0o600})}:async m=>{await transport.sendMail({to:m.email,subject:'琴伴登录验证码',text:`你的琴伴验证码是 ${m.code}，10 分钟内有效。请勿转发。`})});
  const identity=createIdentity({db,secret,mailer}),files=createPrivateFiles(join(directory,'private-files'));
  const library=createPrivateLibrary({db,files}),transfers=createPrivateTransfers({db,files,library});
  const subscriptions=createSubscriptions({db,gateways:paymentGateways||await loadPaymentGateways()}),sources=createRecognitionSources({library}),recognition=createHostedRecognition({db,identity,library,sources,billing:subscriptions.wallet,provider:recognitionProvider||createHostedRecognitionProvider()}),operations=createCommercialOperations({db,identity,library,recognition});
  const server=createHostedServer({identity,library,transfers,recognition,operations,subscriptions,landingFile:'commercial.html',distDir,profile,origin:local?(port?`http://127.0.0.1:${port}`:undefined):process.env.QINBAN_PUBLIC_ORIGIN,mailboxDirectory});
  let cleaning=false;const cleanup=async()=>{if(cleaning)return;cleaning=true;try{return await maintainAccounts({db,files})}finally{cleaning=false}};const timer=setInterval(()=>void cleanup().catch(()=>{}),3600000);timer.unref();
  let closed=false;return {db,identity,library,transfers,recognition,operations,subscriptions,server,port,profile,mailboxDirectory,cleanup,async close(){if(closed)return;closed=true;clearInterval(timer);await recognition.close();if(server.listening)await new Promise(r=>server.close(r));await db.close();await lock.close();await rm(lockPath,{force:true})}};
 }catch(e){await db?.close();await lock.close();await rm(lockPath,{force:true});throw e}
}
