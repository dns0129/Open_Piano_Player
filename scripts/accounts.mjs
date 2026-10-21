import {createHostedRuntime} from '../lib/accounts/runtime.mjs';
const command=process.argv[2]||'start';
const runtime=await createHostedRuntime();
if(command==='invite'||command==='operator'){
 try{const result=await (command==='operator'?runtime.identity.bootstrapOperator(process.argv[3]):runtime.identity.invite(process.argv[3]));console.log(command==='operator'?`已为 ${result.email} 建立运营登录资格；请重新用邮箱验证码登录。`:`已邀请 ${result.email}；有效期至 ${result.expiresAt}。账号须完成验证码验证后建立。`)}finally{await runtime.close()}
}else if(command==='cleanup'){try{console.log(JSON.stringify(await runtime.cleanup()))}finally{await runtime.close()}}else if(command==='start'){
 await runtime.recognition.start();
 runtime.server.listen(runtime.port,'127.0.0.1',()=>{console.log(`琴伴商业账号版：http://127.0.0.1:${runtime.port}/`);if(runtime.profile==='local')console.log(`独立本机预览：验证码保存在 ${runtime.mailboxDirectory}，不会发送真实邮件。`)});
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await runtime.close();process.exit(0)});
}else{await runtime.close();throw Error('Use start, cleanup, invite <email> or operator <email>')}
