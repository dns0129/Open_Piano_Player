/**
 * One FIFO gate across jobs; aborting a queued call never spends a request.
 * A running call may `hold` the slot for an underlying request it no longer awaits
 * (for example after a timeout): the physical slot is released only after that
 * request has actually settled, so a timed-out call never lets a new one overlap it.
 */
export function createRecognitionGate(limit=100){
 let active=0;const queue=[];
 const pump=()=>{while(active<limit&&queue.length){const next=queue.shift();if(next.signal.aborted){next.reject(next.signal.reason);continue;}next.signal.removeEventListener('abort',next.abort);active++;next.resolve(()=>{active--;pump();});}};
 async function run(work,signal){signal.throwIfAborted();const release=await new Promise((resolve,reject)=>{const item={resolve,reject,signal,abort(){const i=queue.indexOf(item);if(i>=0)queue.splice(i,1);reject(signal.reason);}};queue.push(item);signal.addEventListener('abort',item.abort,{once:true});pump();});const held=[];try{signal.throwIfAborted();return await work({hold:promise=>{held.push(Promise.resolve(promise).catch(()=>{}));}});}finally{if(held.length)Promise.allSettled(held).then(release);else release();}}
 run.stats=()=>({active,queued:queue.length,limit});
 return run;
}
