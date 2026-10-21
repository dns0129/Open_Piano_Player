import {createHostedRuntime} from '../lib/accounts/runtime.mjs';
const command=process.argv[2]||'start';
const runtime=await createHostedRuntime();
if(command==='invite'){
 try{const result=await runtime.identity.invite(process.argv[3]);console.log(`已邀请 ${result.email}；有效期至 ${result.expiresAt}。账号须完成验证码验证后建立。`)}finally{await runtime.close()}
}else if(command==='cleanup'){try{console.log(JSON.stringify(await runtime.cleanup()))}finally{await runtime.close()}}else if(command==='start'){
 runtime.server.listen(runtime.port,'127.0.0.1',()=>{console.log(`琴伴账号版：http://127.0.0.1:${runtime.port}/account.html`);if(runtime.profile==='local')console.log(`本机验证模式：验证码保存在 ${runtime.mailboxDirectory}，不会发送真实邮件。`)});
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await runtime.close();process.exit(0)});
}else{await runtime.close();throw Error('Use start or invite <email>')}
