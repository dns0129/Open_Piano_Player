import {createHostedRuntime} from '../lib/accounts/runtime.mjs';
import {fileURLToPath} from 'node:url';
// .local/ and dist-hosted/ are resolved from the working directory; pin it to the project.
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const command=process.argv[2]||'start';
const runtime=await createHostedRuntime();
if(command==='invite'||command==='operator'){
 try{const result=await (command==='operator'?runtime.identity.bootstrapOperator(process.argv[3]):runtime.identity.invite(process.argv[3]));console.log(command==='operator'?`已为 ${result.email} 建立运营登录资格；请重新用邮箱验证码登录。`:`已邀请 ${result.email}；有效期至 ${result.expiresAt}。账号须完成验证码验证后建立。`)}finally{await runtime.close()}
}else if(command==='invite-code'){
 // npm run accounts:invite-code -- --uses 10 --bonus 3 --days 30 --note "首批用户"
 const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback};
 try{const code=await runtime.identity.invites.createOperatorCode({maxUses:Number(option('uses','1')),bonusTasks:Number(option('bonus','0')),expiresInDays:option('days')?Number(option('days')):null,note:option('note','')});console.log(`邀请码：${code.code}\n可用 ${code.maxUses} 次 · 注册赠送 ${code.bonusTasks} 个识谱任务 · ${code.expiresAt?'有效期至 '+code.expiresAt.slice(0,10):'长期有效'}\n完整邀请码只显示这一次，请妥善保存。`)}catch(e){console.error(e.message);process.exitCode=1}finally{await runtime.close()}
}else if(command==='cleanup'){try{console.log(JSON.stringify(await runtime.cleanup()))}finally{await runtime.close()}}else if(command==='start'){
 await runtime.recognition.start();
 runtime.server.listen(runtime.port,'127.0.0.1',()=>{console.log(`琴伴商业账号版：http://127.0.0.1:${runtime.port}/`);if(runtime.profile==='local')console.log(`独立本机预览：验证码保存在 ${runtime.mailboxDirectory}，不会发送真实邮件。`)});
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await runtime.close();process.exit(0)});
}else{await runtime.close();throw Error('Use start, cleanup, invite <email> or operator <email>')}
