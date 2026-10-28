import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const root=resolve(import.meta.dirname,'..');
test('HTTP image uploads and previews require owner auth; signed provider delivery works without cookies and expires',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'studio-delivery-http-')),port=35000+Math.floor(Math.random()*15000);
  const base=`http://127.0.0.1:${port}`,publicBase='https://studio.example.com',secret='test-delivery-secret-at-least-32-characters';
  const preload=join(dir,'no-providers.mjs');writeFileSync(preload,"globalThis.fetch=async()=>{throw new Error('No provider calls allowed');};");
  const child=spawn(process.execPath,['--import',preload,'server/index.mjs'],{cwd:root,stdio:'pipe',env:{...process.env,STUDIO_HOME:dir,STUDIO_READY_FILE:'',DATA_DIR:join(dir,'data'),PORT:String(port),HOST:'127.0.0.1',PUBLIC_BASE_URL:publicBase,SESSION_SECRET:secret,ADMIN_PASSWORD_HASH:'',ADMIN_PASSWORD:'test-owner-password',SCHEDULE_ENABLED:'false',OPENAI_API_KEY:'',X_CLIENT_ID:'',X_CLIENT_SECRET:''}});
  let stderr='';child.stdout.resume();child.stderr.on('data',data=>stderr+=data);
  // Simulate the local HTTP side of an HTTPS reverse proxy, preserving its public Host.
  const request=(path,options={})=>new Promise((resolve,reject)=>{
    const req=httpRequest(base+path,{method:options.method||'GET',headers:{Host:'studio.example.com',Origin:publicBase,...options.headers}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on('error',reject);req.end(options.body);
  });
  try{
    let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw new Error(stderr);try{if((await request('/api/health')).ok){ready=true;break;}}catch{}await delay(50);}assert.ok(ready);
    assert.equal((await request('/api/social/state')).status,401);
    const bytes=readFileSync(new URL('./fixtures/social.jpg',import.meta.url));
    const upload=(body,headers={})=>request('/api/social/library/upload',{method:'POST',body,headers:{'Content-Type':'image/jpeg','X-File-Name':encodeURIComponent('New image.jpg'),...headers}});
    assert.equal((await upload(bytes)).status,401);
    const login=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-owner-password'})});assert.equal(login.status,200);
    const Cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await upload(bytes,{Cookie,Origin:'https://wrong.example'})).status,403);
    assert.equal((await upload(Buffer.from('not an image'),{Cookie})).status,400);
    const result=await upload(bytes,{Cookie});assert.equal(result.status,201);const {media}=await result.json();assert.equal(media.kind,'image');assert.equal(media.ai_generated,0);
    assert.equal((await request('/api/images/'+media.stored_name)).status,401);
    assert.deepEqual(Buffer.from(await (await request('/api/images/'+media.stored_name,{headers:{Cookie}})).arrayBuffer()),bytes);
    const path='/api/social/delivery/'+media.id;
    assert.equal((await request(path)).status,403);
    const signed=expires=>path+'?'+new URLSearchParams({expires:String(expires),signature:createHmac('sha256',secret).update(`social-delivery:${media.id}:${expires}`).digest('hex')});
    const expires=Math.floor(Date.now()/1000)+3500;
    const delivered=await request(signed(expires));assert.equal(delivered.status,200);assert.equal(delivered.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes);
    const head=await request(signed(expires),{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
    assert.equal((await request(signed(Math.floor(Date.now()/1000)-1))).status,403);
    assert.equal((await request(signed(Math.floor(Date.now()/1000)+7200))).status,403);
    assert.equal((await request(signed(expires).replace(media.id,'00000000-0000-0000-0000-000000000000'))).status,403);
    const state=await (await request('/api/social/state',{headers:{Cookie}})).json();assert.equal(state.mediaDeliveryReady,true);assert.equal(state.media.length,1);assert.equal(state.posts.length,0);assert.equal(JSON.stringify(state).includes(secret),false);
  }finally{if(child.exitCode===null&&child.signalCode===null){const end=once(child,'exit');child.kill('SIGTERM');await end;}rmSync(dir,{recursive:true,force:true});}
});
