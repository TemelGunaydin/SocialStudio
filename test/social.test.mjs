import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../server/db.mjs';
import { createSocialStudio } from '../server/social.mjs';
import { upsertAccount, publishSocial, oauthStart, oauthFinish, accountToken } from '../server/social-platforms.mjs';
import { socialCopy, selectVideo } from '../server/social-ai.mjs';
import { scanFolder, archiveMedia, listFolders } from '../server/media-library.mjs';
import { generateCopy } from '../server/openai.mjs';

const response = data => Response.json(data);
const aiResponse = data => response({ output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}] });
function mp4() {
  const box=(type,payload=Buffer.alloc(0))=>{const head=Buffer.alloc(8);head.writeUInt32BE(payload.length+8);head.write(type,4);return Buffer.concat([head,payload]);};
  return Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov'),box('mdat',Buffer.alloc(32,42))]);
}
function fixture(options={}) {
  const dir=mkdtempSync(join(tmpdir(),'studio-social-'));
  const store=openStore(join(dir,'data'));
  let calls=0;
  const studio=createSocialStudio({store,dataDir:join(dir,'data'),configPath:join(dir,'.env'),readJson:async req=>req.body||{},reply:(res,status,body)=>{res.status=status;res.body=body;},
    fetchImpl:options.fetchImpl||(()=>{throw new Error('Unexpected network request');}),publisher:options.publisher|| (async (_store,post)=>{calls++;return {id:`remote-${post.id}`,url:'https://example.com/post'};})});
  const request=async (path,body,method='POST')=>{const res={};await studio.handle({method,body},res,new URL(`http://localhost${path}`));return res.body;};
  const addAccount=(platform,name)=>{upsertAccount(store,platform,name,name,name,{access_token:`token-${name}`,refresh_token:`refresh-${name}`,expires_at:Date.now()+3600000});return store.db.prepare('SELECT * FROM social_accounts WHERE remote_id=? AND platform=?').get(name,platform);};
  const create=async(targets=[{platform:'x'}])=>(await request('/api/social/posts',{context:'Sesli notlarını metne dönüştüren uygulamayı tanıt.',model:'gpt-6-luna',targets})).posts;
  const save=async(post,extra={})=>(await request(`/api/social/posts/${post.id}`,{revision:post.revision,title:'Video başlığı',text:'Sesli notlarını yazıya dönüştür.',accountId:post.account_id,mediaId:post.media_id,options:post.platform==='youtube'?{privacy:'private'}:{},...extra})).post;
  return {dir,store,studio,request,addAccount,create,save,get calls(){return calls;},close(){store.db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('folder picker lists only visible directories and resolves parent paths without importing files',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'picker');mkdirSync(folder);mkdirSync(join(folder,'Tanıtım & videolar "deneme"'));mkdirSync(join(folder,'.hidden'));
    writeFileSync(join(folder,'demo.mp4'),mp4());symlinkSync(join(folder,'Tanıtım & videolar "deneme"'),join(folder,'linked'));
    const result=await f.request('/api/social/library/folders',{folder});
    assert.equal(result.folder,realpathSync(folder));assert.equal(result.parent,dirname(realpathSync(folder)));
    assert.deepEqual(result.folders,[{name:'Tanıtım & videolar "deneme"',path:join(realpathSync(folder),'Tanıtım & videolar "deneme"')}]);
    const child=await f.request('/api/social/library/folders',{folder:result.folders[0].path});assert.deepEqual(child.folders,[]);assert.equal(child.parent,result.folder);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM media_library').get().n,0);assert.equal(f.store.getSetting.get('social_folder'),undefined);assert.equal(f.calls,0);
    const root=await listFolders(parse(folder).root);assert.equal(root.parent,null);
  }finally{f.close();}
});

test('folder picker rejects invalid, missing, and non-directory paths with a recoverable error',async()=>{
  const f=fixture();try{
    writeFileSync(join(f.dir,'file.txt'),'not a directory');
    for(const input of [null,42,[],{},'relative/path'])await assert.rejects(()=>listFolders(input),error=>error.status===400);
    await assert.rejects(()=>listFolders(join(f.dir,'missing')),error=>error.status===400&&/bulunamadı/.test(error.message));
    await assert.rejects(()=>listFolders(join(f.dir,'file.txt')),error=>error.status===400&&/açılamıyor/.test(error.message));
    assert.ok((await f.request('/api/social/library/folders',{folder:f.dir})).folders.length);
  }finally{f.close();}
});

test('multi-account campaigns preserve distinct account targets, revisions and private tokens',async()=>{
  const f=fixture();try{
    const one=f.addAccount('x','first'),two=f.addAccount('x','second'),youtube=f.addAccount('youtube','channel');
    const posts=await f.create([{platform:'x',accountId:one.id},{platform:'x',accountId:two.id},{platform:'youtube',accountId:youtube.id}]);
    assert.equal(posts.length,3);assert.equal(new Set(posts.map(post=>post.batch_id)).size,1);
    await assert.rejects(()=>f.create([{platform:'x',accountId:youtube.id}]),/eşleşmiyor/);
    await assert.rejects(()=>f.create([{platform:'x',accountId:one.id},{platform:'x',accountId:one.id}]),/iki kez/);
    const saved=await f.save(posts[0]);assert.equal(saved.revision,2);
    await assert.rejects(()=>f.save(posts[0]),/başka sekmede/);
    const state=await f.request('/api/social/state',null,'GET');
    assert.equal(state.accounts.length,3);assert.equal(JSON.stringify(state).includes('token-first'),false);
    assert.equal(f.calls,0);
  }finally{f.close();}
});

test('context and selected Luna model are sent to Responses; filenames are metadata only',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';
  try{
    let sent;
    const copy=await socialCopy({platform:'x',context:'Türkçe ve samimi yaz.',model:'gpt-6-luna',video:{name:'sesli-not.mp4'}},async(url,options)=>{sent=JSON.parse(options.body);assert.match(url,/\/responses$/);return aiResponse({title:'Voice notes',text:'Your voice notes, now in writing.'});});
    assert.equal(copy.text,'Your voice notes, now in writing.');assert.equal(sent.model,'gpt-6-luna');assert.equal(sent.reasoning.effort,'low');assert.equal(sent.store,false);
    assert.match(sent.instructions,/Always write the post text and title in English/);
    assert.match(sent.instructions,/Do not include hashtags/);
    assert.doesNotMatch(sent.instructions,/Match the language of the user context/);
    assert.equal(JSON.parse(sent.input).context,'Türkçe ve samimi yaz.');assert.equal(JSON.parse(sent.input).video_filename,'sesli-not.mp4');
    await assert.rejects(()=>selectVideo('context','x','gpt-6-luna',[{id:'good',name:'clip.mp4'}],async()=>aiResponse({id:'outside',reason:'bad'})),/kütüphane dışı/);
    await assert.rejects(()=>socialCopy({platform:'x',context:'x',model:'gpt-6-luna'},async()=>aiResponse({title:'Title',text:'😀'.repeat(141)})),/karakter/);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('TikTok generation requests English for Turkish context and separates every caption line',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';
  const lines=['✨ Ready to organize your ideas?','Meet Notes 📱','📝 Keep voice notes as text.','Start with your next idea.','https://example.com/notes','#Notes #Productivity'];
  try{
    let sent;
    const raw=`  ${lines.join(' \r\n')}\n\n\n`;
    const result=await socialCopy({platform:'tiktok',context:'Not uygulamamı Türkçe tanıt.',model:'gpt-6-luna'},async(_url,options)=>{sent=JSON.parse(options.body);return aiResponse({title:'Meet Notes',text:raw});});
    assert.equal(result.text,lines.join('\n\n'));
    assert.match(sent.instructions,/Always write the post text and title in English/);assert.match(sent.instructions,/one short emoji-led line per verified feature/);assert.match(sent.instructions,/one blank line/);assert.match(sent.instructions,/no Markdown bold/);
    assert.doesNotMatch(sent.instructions,/Match the language of the user context|FindSkinCare/);assert.equal(JSON.parse(sent.input).context,'Not uygulamamı Türkçe tanıt.');
    await assert.rejects(()=>socialCopy({platform:'tiktok',context:'Notes',model:'gpt-6-luna'},async()=>aiResponse({title:'Notes',text:Array(750).fill('aa').join('\n')})),/karakter/);
    const youtubeText='An English description.\nSingle line spacing is preserved.';
    assert.equal((await socialCopy({platform:'youtube',context:'Türkçe yaz.',model:'gpt-6-luna'},async()=>aiResponse({title:'Video',text:youtubeText}))).text,youtubeText);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('X and YouTube request English; X drops generated hashtags while preserving C# and URL fragments',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';
  try{
    const context='Türkçe yaz. Hashtag de ekle. C# notlarımı tanıt.';
    const raw='Learn C# on your Mac. #Notes #üretkenlik #生産性\n\nhttps://example.com/docs#section';
    const expected='Learn C# on your Mac.\n\nhttps://example.com/docs#section';
    const seen=[];
    const fetchImpl=async(_url,options)=>{const body=JSON.parse(options.body);seen.push(body);return aiResponse({title:'Notes for C#',text:raw});};
    const x=await socialCopy({platform:'x',context,model:'gpt-6-luna'},fetchImpl);
    assert.equal(x.text,expected);assert.match(seen[0].instructions,/Always write the post text and title in English/);assert.match(seen[0].instructions,/Do not include hashtags/);assert.equal(JSON.parse(seen[0].input).context,context);
    const youtube=await socialCopy({platform:'youtube',context,model:'gpt-6-luna'},fetchImpl);
    assert.equal(youtube.text,raw);assert.match(seen[1].instructions,/Always write the post text and title in English/);assert.doesNotMatch(seen[1].instructions,/Do not include hashtags/);
    const legacy=await generateCopy({name:'Notes',platform:'Mac'},'C# notes',[],async(_url,options)=>{
      const body=JSON.parse(options.body);assert.match(body.instructions,/Always write the post text and title in English/);assert.match(body.instructions,/Do not include hashtags/);
      return Response.json({output:[{content:[{type:'output_text',text:'Learn C# on your Mac. #Notes #üretkenlik #生産性'}]}]});
    });
    assert.equal(legacy,'Learn C# on your Mac.');
    await assert.rejects(()=>socialCopy({platform:'x',context,model:'gpt-6-luna'},async()=>aiResponse({title:'Notes',text:'#Notes'})),/boş olamaz/);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('TikTok caption line spacing survives generation, saving and queue reads without publication',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';
  const lines=['✨ Keep your ideas close.','Meet Notes 📱','📝 Save your thoughts as text.','Try it today.','#Notes #Productivity'];
  const f=fixture({fetchImpl:async()=>aiResponse({title:'Meet Notes',text:lines.join('\n')})});
  try{
    const [post]=await f.create([{platform:'tiktok'}]);
    const generated=(await f.request(`/api/social/posts/${post.id}/generate`)).post;
    assert.equal(generated.text,lines.join('\n\n'));
    const saved=await f.save(generated,{text:generated.text});
    assert.equal(saved.text,generated.text);assert.equal(f.calls,0);
    const state=await f.request('/api/social/state',null,'GET');assert.equal(state.posts.find(item=>item.id===post.id).text,generated.text);
  }finally{f.close();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('folder scan validates MP4s, ignores subfolders/symlinks, and never duplicates imports',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);mkdirSync(join(folder,'paylasildi'));
    writeFileSync(join(folder,'good.mp4'),mp4());writeFileSync(join(folder,'bad.mp4'),'bad');writeFileSync(join(folder,'paylasildi','old.mp4'),mp4());symlinkSync(join(folder,'good.mp4'),join(folder,'link.mp4'));
    const result=await scanFolder(f.store,join(f.dir,'data'),folder);assert.equal(result.imported,1);assert.equal(result.skipped.length,1);
    assert.equal((await scanFolder(f.store,join(f.dir,'data'),folder)).imported,0);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM media_library').get().n,1);assert.ok(existsSync(join(folder,'good.mp4')));
  }finally{f.close();}
});

test('shared source video archives only after every platform publishes and preserves preview',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);const source=join(folder,'demo.mp4');writeFileSync(source,mp4());
    await scanFolder(f.store,join(f.dir,'data'),folder);const media=f.store.db.prepare('SELECT * FROM media_library').get();
    const x=f.addAccount('x','one'),yt=f.addAccount('youtube','two');
    const posts=await f.create([{platform:'x',accountId:x.id},{platform:'youtube',accountId:yt.id}]);
    const first=await f.save(posts[0],{mediaId:media.id}),second=await f.save(posts[1],{mediaId:media.id});
    await f.request(`/api/social/posts/${first.id}/publish`);assert.ok(existsSync(source));
    await f.request(`/api/social/posts/${second.id}/publish`);assert.equal(existsSync(source),false);
    assert.equal(readdirSync(join(folder,'paylasildi')).length,1);assert.ok(existsSync(join(f.dir,'data','videos',media.stored_name)));assert.equal(f.calls,2);
    await assert.rejects(()=>f.request(`/api/social/posts/${first.id}/publish`),/düzenlenemez/);assert.equal(f.calls,2);
  }finally{f.close();}
});

test('uncertain publication retains source, blocks repeats, and requires verified resolution',async()=>{
  let calls=0;const f=fixture({publisher:async()=>{calls++;throw Object.assign(new Error('lost response'),{uncertain:true});}});
  try{
    const folder=join(f.dir,'clips');mkdirSync(folder);const source=join(folder,'demo.mp4');writeFileSync(source,mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get(),account=f.addAccount('x','one');let [post]=await f.create([{platform:'x',accountId:account.id}]);post=await f.save(post,{mediaId:media.id});
    await assert.rejects(()=>f.request(`/api/social/posts/${post.id}/publish`),/lost response/);
    assert.equal(f.store.db.prepare('SELECT status FROM social_posts WHERE id=?').get(post.id).status,'uncertain');assert.ok(existsSync(source));
    await f.studio.scheduler();await assert.rejects(()=>f.request(`/api/social/posts/${post.id}/publish`),/düzenlenemez/);assert.equal(calls,1);
    await assert.rejects(()=>f.request(`/api/social/posts/${post.id}/resolve`,{published:false}),/doğrulayın/);
    await f.request(`/api/social/posts/${post.id}/resolve`,{published:true});assert.equal(existsSync(source),false);
  }finally{f.close();}
});

test('archive does not move an original changed after import and never overwrites a destination',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);const source=join(folder,'demo.mp4');writeFileSync(source,mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get(),account=f.addAccount('x','one');let [post]=await f.create([{platform:'x',accountId:account.id}]);post=await f.save(post,{mediaId:media.id});
    writeFileSync(source,'new contents');await f.request(`/api/social/posts/${post.id}/publish`);assert.equal(readFileSync(source,'utf8'),'new contents');
    assert.match(f.store.db.prepare('SELECT error FROM media_library').get().error,/değişmiş/);
    writeFileSync(source,mp4());mkdirSync(join(folder,'paylasildi'));const destination=join(folder,'paylasildi',`${media.id}-demo.mp4`);writeFileSync(destination,'do not overwrite');
    await archiveMedia(f.store,join(f.dir,'data'),media.id);assert.equal(readFileSync(destination,'utf8'),'do not overwrite');assert.ok(existsSync(source));
  }finally{f.close();}
});

test('scheduled posts publish once when due; failed attempts are never retried automatically',async()=>{
  const f=fixture();try{
    const account=f.addAccount('x','one');let [post]=await f.create([{platform:'x',accountId:account.id}]);post=await f.save(post);
    await assert.rejects(()=>f.request(`/api/social/posts/${post.id}/schedule`,{at:'yesterday'}),/yayın zamanı/);
    await f.request(`/api/social/posts/${post.id}/schedule`,{at:new Date(Date.now()+120000).toISOString()});
    await f.studio.scheduler();assert.equal(f.calls,0);
    f.store.db.prepare('UPDATE social_posts SET scheduled_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',post.id);
    await Promise.all([f.studio.scheduler(),f.studio.scheduler()]);await f.studio.scheduler();assert.equal(f.calls,1);
  }finally{f.close();}
});

test('two X accounts publish using their own tokens and the exact reviewed text',async()=>{
  const f=fixture();try{
    const first=f.addAccount('x','first'),second=f.addAccount('x','second');const authorization=[];
    for(const account of [first,second])await publishSocial(f.store,{platform:'x',account_id:account.id,text:'Reviewed copy',options:'{}'},null,join(f.dir,'data'),async(url,options)=>{assert.match(url,/\/tweets$/);authorization.push(options.headers.Authorization);assert.equal(JSON.parse(options.body).text,'Reviewed copy');return response({data:{id:String(authorization.length)}});});
    assert.deepEqual(authorization,['Bearer token-first','Bearer token-second']);
  }finally{f.close();}
});

test('YouTube uploads reviewed metadata and video using a validated resumable session',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);writeFileSync(join(folder,'demo.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get(),account=f.addAccount('youtube','channel');let step=0;
    const result=await publishSocial(f.store,{platform:'youtube',account_id:account.id,text:'Description',title:'Title',options:JSON.stringify({privacy:'unlisted',madeForKids:true})},media,join(f.dir,'data'),async(url,options)=>{
      step++;assert.equal(options.headers.Authorization,'Bearer token-channel');
      if(step===1){const body=JSON.parse(options.body);assert.equal(body.snippet.title,'Title');assert.equal(body.status.privacyStatus,'unlisted');assert.equal(body.status.selfDeclaredMadeForKids,true);return new Response('',{headers:{location:'https://www.googleapis.com/upload/session'}});}
      assert.equal(options.method,'PUT');assert.equal(options.body.size,mp4().length);return response({id:'video123'});
    });assert.equal(step,2);assert.equal(result.url,'https://www.youtube.com/watch?v=video123');
    await assert.rejects(()=>publishSocial(f.store,{platform:'youtube',account_id:account.id,text:'D',title:'T',options:'{}'},media,join(f.dir,'data'),async()=>new Response('',{headers:{location:'http://127.0.0.1/private'}})),/adres/);
    let count=0;await assert.rejects(()=>publishSocial(f.store,{platform:'youtube',account_id:account.id,text:'D',title:'T',options:'{}'},media,join(f.dir,'data'),async()=>++count===1?new Response('',{headers:{location:'https://www.googleapis.com/upload/session'}}):Promise.reject(new Error('network lost'))),error=>error.uncertain===true);
  }finally{f.close();}
});

test('TikTok validates creator privacy/duration/consent then uploads and confirms completion',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);writeFileSync(join(folder,'demo.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get(),account=f.addAccount('tiktok','creator');let calls=[];
    const fetchImpl=async(url,options)=>{calls.push(url);if(url.includes('creator_info'))return response({data:{creator_nickname:'Creator',creator_username:'creator',privacy_level_options:['SELF_ONLY'],max_video_post_duration_sec:60,comment_disabled:true},error:{code:'ok'}});
      if(url.includes('video/init')){const body=JSON.parse(options.body);assert.equal(body.post_info.disable_comment,true);assert.equal(body.source_info.total_chunk_count,1);return response({data:{publish_id:'publish1',upload_url:'https://open-upload.tiktokapis.com/upload/'},error:{code:'ok'}});}
      if(options.method==='PUT'){assert.equal(options.headers.Authorization,undefined);assert.equal(options.body.length,mp4().length);return new Response(null,{status:201});}
      return response({data:{status:'PUBLISH_COMPLETE',publicaly_available_post_id:['123']},error:{code:'ok'}});};
    const post={platform:'tiktok',account_id:account.id,text:'Caption',options:JSON.stringify({privacy:'SELF_ONLY',duration:10,consent:true,allowComment:true})};
    const result=await publishSocial(f.store,post,media,join(f.dir,'data'),fetchImpl,async()=>{});assert.equal(calls.length,4);assert.equal(result.id,'123');
    calls=[];await assert.rejects(()=>publishSocial(f.store,{...post,options:JSON.stringify({privacy:'PUBLIC_TO_EVERYONE',duration:10,consent:true})},media,join(f.dir,'data'),fetchImpl),/görünürlüğünü/);assert.equal(calls.length,1);
    await assert.rejects(()=>publishSocial(f.store,{...post,options:JSON.stringify({privacy:'SELF_ONLY',duration:61,consent:true})},media,join(f.dir,'data'),fetchImpl),/video süresi/);
  }finally{f.close();}
});

test('OAuth state is platform-bound, single-use, and account refresh is isolated',async()=>{
  const old={...process.env};Object.assign(process.env,{YOUTUBE_CLIENT_ID:'test-client',YOUTUBE_CLIENT_SECRET:'test-secret',PUBLIC_BASE_URL:'http://localhost:3000'});
  const f=fixture();try{
    const start=new URL(oauthStart(f.store,'youtube'));assert.equal(start.searchParams.get('prompt'),'consent select_account');const state=start.searchParams.get('state');
    const fetchImpl=async(url)=>url.includes('/token')?response({access_token:'access',refresh_token:'refresh',expires_in:3600}):response({items:[{id:'channel',snippet:{title:'Channel',customUrl:'@channel'}}]});
    await oauthFinish(f.store,'youtube',state,'code',fetchImpl);await assert.rejects(()=>oauthFinish(f.store,'youtube',state,'code',fetchImpl),/geçersiz/);
    const account=f.store.db.prepare("SELECT * FROM social_accounts WHERE remote_id='channel'").get();
    f.store.db.prepare('UPDATE social_accounts SET token=? WHERE id=?').run(JSON.stringify({access_token:'expired',refresh_token:'refresh',expires_at:0}),account.id);
    let refreshCalls=0;const refresh=async()=>{refreshCalls++;return response({access_token:'refreshed',expires_in:3600});};
    assert.deepEqual(await Promise.all([accountToken(f.store,account,refresh),accountToken(f.store,account,refresh)]),['refreshed','refreshed']);assert.equal(refreshCalls,1);
  }finally{f.close();for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});

test('automation requires explicit supported accounts and runs selection/generation/publication once',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';let f;
  try{
    f=fixture({fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);const input=JSON.parse(body.input);return input.candidates?aiResponse({id:input.candidates[0].id,reason:'Dosya adı bağlama uygun.'}):aiResponse({title:'Video',text:'Yeni sesli not uygulaması.'});}});
    const folder=join(f.dir,'clips');mkdirSync(folder);writeFileSync(join(folder,'demo.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const account=f.addAccount('x','one'),tiktok=f.addAccount('tiktok','two');
    const rule={enabled:true,context:'Yeni uygulamam.',model:'gpt-6-luna',targets:[{platform:'x',accountId:account.id}],intervalHours:24,privacy:'private'};
    await assert.rejects(()=>f.request('/api/social/automation',{...rule,targets:[{platform:'tiktok',accountId:tiktok.id}]}),/TikTok/);
    await f.request('/api/social/automation',rule);await f.studio.scheduler();assert.equal(f.calls,0);
    const saved=JSON.parse(f.store.getSetting.get('social_automation').value);f.store.setSetting.run('social_automation',JSON.stringify({...saved,nextAt:'2020-01-01T00:00:00.000Z'}));
    await f.studio.scheduler();await f.studio.scheduler();assert.equal(f.calls,1);assert.equal(existsSync(join(folder,'demo.mp4')),false);
    await f.request('/api/social/automation',{enabled:false});assert.equal(JSON.parse(f.store.getSetting.get('social_automation').value).enabled,false);
  }finally{f?.close();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('legacy X balance and multi-account publishing share one canonical refresh', async () => {
  const savedEnv={X_CLIENT_ID:process.env.X_CLIENT_ID,X_CLIENT_SECRET:process.env.X_CLIENT_SECRET,PUBLIC_BASE_URL:process.env.PUBLIC_BASE_URL};
  Object.assign(process.env,{X_CLIENT_ID:'client',X_CLIENT_SECRET:'secret',PUBLIC_BASE_URL:'http://localhost:3000'});
  const f=fixture();try{
    const { readCredits }=await import('../server/x.mjs');
    const user={id:'owner',username:'owner',name:'Owner'};
    const token={user,access_token:'expired',refresh_token:'refresh',expires_at:0};
    f.store.setSetting.run('x_token',JSON.stringify(token));upsertAccount(f.store,'x',user.id,user.name,user.username,token);
    const account=f.store.db.prepare('SELECT * FROM social_accounts').get();let refreshes=0;
    const fetchImpl=async(url,options)=>{
      if(url.endsWith('/oauth2/token')){refreshes++;return response({access_token:'new-token',refresh_token:'new-refresh',expires_in:7200});}
      assert.equal(options.headers.Authorization,'Bearer new-token');
      return url.endsWith('/usage/credits')?response({data:{total_balance:10,prepaid_balance:10,free_balance:0}}):response({data:{id:'posted'}});
    };
    await Promise.all([readCredits(f.store,fetchImpl),publishSocial(f.store,{platform:'x',account_id:account.id,text:'Reviewed copy',options:'{}'},null,join(f.dir,'data'),fetchImpl)]);
    assert.equal(refreshes,1);assert.equal(JSON.parse(f.store.getSetting.get('x_token').value).refresh_token,'new-refresh');assert.equal(JSON.parse(f.store.db.prepare('SELECT token FROM social_accounts').get().token).refresh_token,'new-refresh');
  }finally{f.close();for(const [key,value]of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('failed scheduled posts remain failed, and a new file may reuse an archived source filename',async()=>{
  let attempts=0;const f=fixture({publisher:async()=>{attempts++;throw new Error('Provider rejected');}});try{
    const account=f.addAccount('x','owner');let [post]=await f.create([{platform:'x',accountId:account.id}]);post=await f.save(post);
    await f.request(`/api/social/posts/${post.id}/schedule`,{at:new Date(Date.now()+120000).toISOString()});f.store.db.prepare('UPDATE social_posts SET scheduled_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',post.id);
    await f.studio.scheduler();await f.studio.scheduler();assert.equal(attempts,1);assert.equal(f.store.db.prepare('SELECT status FROM social_posts').get().status,'failed');
    const folder=join(f.dir,'clips');mkdirSync(folder);writeFileSync(join(folder,'demo.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);const media=f.store.db.prepare('SELECT * FROM media_library').get();
    f.store.db.prepare("UPDATE social_posts SET status='published',media_id=? WHERE id=?").run(media.id,post.id);await archiveMedia(f.store,join(f.dir,'data'),media.id);
    writeFileSync(join(folder,'demo.mp4'),mp4());assert.equal((await scanFolder(f.store,join(f.dir,'data'),folder)).imported,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM media_library').get().n,2);
  }finally{f.close();}
});

test('selected image model generates a private asset without replacing YouTube video',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';const requests=[];
  const f=fixture({fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return response({data:[{b64_json:readFileSync(new URL('./fixtures/social.jpg',import.meta.url)).toString('base64')}]});}});
  try{
    const [x,yt]=await f.create([{platform:'x'},{platform:'youtube'}]);
    const generated=await f.request(`/api/social/posts/${x.id}/image`,{model:'gpt-image-1-mini'});assert.equal(generated.attached,true);assert.ok(existsSync(join(f.dir,'data','images',generated.media.stored_name)));
    const second=await f.request(`/api/social/posts/${yt.id}/image`,{model:'gpt-image-2'});assert.equal(second.attached,false);assert.equal(f.store.db.prepare('SELECT media_id FROM social_posts WHERE id=?').get(yt.id).media_id,null);
    assert.equal(requests[0].body.model,'gpt-image-1-mini');assert.equal(requests[1].body.model,'gpt-image-2');assert.ok(requests[0].body.prompt.includes(x.context));assert.ok(requests.every(item=>item.url.endsWith('/images/generations')));assert.equal(f.calls,0);
  }finally{f.close();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('archive recovers an interrupted file move and restart preserves uncertain publication',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'clips');mkdirSync(folder);const source=join(folder,'demo.mp4');writeFileSync(source,mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get();const [post]=await f.create();f.store.db.prepare("UPDATE social_posts SET status='published',media_id=? WHERE id=?").run(media.id,post.id);
    const { linkSync,unlinkSync }=await import('node:fs');mkdirSync(join(folder,'paylasildi'));const destination=join(folder,'paylasildi',`${media.id}-demo.mp4`);linkSync(source,destination);unlinkSync(source);
    await archiveMedia(f.store,join(f.dir,'data'),media.id);assert.equal(f.store.db.prepare('SELECT status FROM media_library').get().status,'published');
    f.store.db.prepare("UPDATE social_posts SET status='publishing' WHERE id=?").run(post.id);
    const reopened=openStore(join(f.dir,'data'));assert.equal(reopened.db.prepare('SELECT status FROM social_posts').get().status,'uncertain');reopened.db.close();assert.ok(existsSync(destination));
  }finally{f.close();}
});

function publicMediaEnv() {
  const old={...process.env};Object.assign(process.env,{PUBLIC_BASE_URL:'https://studio.example.com',SESSION_SECRET:'test-media-secret-at-least-32-characters'});
  return ()=>{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);};
}
const jpeg=()=>readFileSync(new URL('./fixtures/social.jpg',import.meta.url));

test('mixed media folders import images privately and shared images archive after all posts',async()=>{
  const f=fixture();try{
    const folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'photo.jpeg'),jpeg());writeFileSync(join(folder,'clip.mp4'),mp4());writeFileSync(join(folder,'broken.jpg'),'not an image');
    symlinkSync(join(folder,'photo.jpeg'),join(folder,'linked.jpg'));
    const scan=await scanFolder(f.store,join(f.dir,'data'),folder);assert.equal(scan.imported,2);assert.equal(scan.skipped.length,1);
    assert.equal((await scanFolder(f.store,join(f.dir,'data'),folder)).imported,0);
    const image=f.store.db.prepare("SELECT * FROM media_library WHERE kind='image'").get();assert.equal(image.ai_generated,0);assert.match(image.stored_name,/\.jpg$/);
    const a=f.addAccount('x','first'),b=f.addAccount('x','second');
    const posts=await f.create([{platform:'x',accountId:a.id},{platform:'x',accountId:b.id}]);
    for(const post of posts)await f.save(post,{mediaId:image.id});
    await f.request(`/api/social/posts/${posts[0].id}/publish`);assert.ok(existsSync(join(folder,'photo.jpeg')));
    await f.request(`/api/social/posts/${posts[1].id}/publish`);assert.equal(existsSync(join(folder,'photo.jpeg')),false);assert.ok(existsSync(join(f.dir,'data','images',image.stored_name)));
    assert.ok(readdirSync(join(folder,'paylasildi')).some(name=>name.endsWith('photo.jpeg')));
  }finally{f.close();}
});

test('YouTube OAuth adds two channels, reconnects one in place, and rejects missing permissions',async()=>{
  const old={...process.env};Object.assign(process.env,{YOUTUBE_CLIENT_ID:'test-client',YOUTUBE_CLIENT_SECRET:'test-secret',PUBLIC_BASE_URL:'http://localhost:3000'});
  const f=fixture();try{
    async function connect(id,scope='https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly') {
      const auth=new URL(oauthStart(f.store,'youtube'));assert.equal(auth.searchParams.get('access_type'),'offline');assert.equal(auth.searchParams.get('prompt'),'consent select_account');
      await oauthFinish(f.store,'youtube',auth.searchParams.get('state'),'code',async url=>url.includes('/token')?response({access_token:`token-${id}`,refresh_token:`refresh-${id}`,expires_in:3600,scope}):response({items:[{id,snippet:{title:id,customUrl:`@${id}`}}]}));
    }
    await connect('channel-one');await connect('channel-two');
    const first=f.store.db.prepare("SELECT id FROM social_accounts WHERE remote_id='channel-one'").get().id;
    await connect('channel-one');assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM social_accounts').get().n,2);
    assert.equal(f.store.db.prepare("SELECT id FROM social_accounts WHERE remote_id='channel-one'").get().id,first);
    await assert.rejects(()=>connect('denied','https://www.googleapis.com/auth/youtube.readonly'),/Yayın izni/);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM social_accounts').get().n,2);
  }finally{f.close();for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});

test('Instagram OAuth uses Instagram Login, exchanges long-lived tokens, and isolates accounts and refreshes',async()=>{
  const restore=publicMediaEnv();Object.assign(process.env,{INSTAGRAM_CLIENT_ID:'ig-client',INSTAGRAM_CLIENT_SECRET:'ig-secret'});
  const f=fixture();try{
    for(const id of ['one','two']){
      const auth=new URL(oauthStart(f.store,'instagram'));assert.equal(auth.hostname,'www.instagram.com');assert.equal(auth.searchParams.get('force_authentication'),'1');assert.match(auth.searchParams.get('scope'),/instagram_business_content_publish/);
      await oauthFinish(f.store,'instagram',auth.searchParams.get('state'),'code',async url=>url.includes('api.instagram.com')?response({access_token:'short',user_id:id}):url.includes('/access_token?')?response({access_token:`long-${id}`,expires_in:5184000}):response({user_id:id,username:`creator-${id}`}));
    }
    const accounts=f.store.db.prepare("SELECT * FROM social_accounts WHERE platform='instagram' ORDER BY remote_id").all();assert.equal(accounts.length,2);
    assert.equal(await accountToken(f.store,accounts[0],()=>{throw new Error('Must not refresh early');}),'long-one');
    f.store.db.prepare('UPDATE social_accounts SET token=? WHERE id=?').run(JSON.stringify({access_token:'long-one',expires_at:Date.now()+2*86400000}),accounts[0].id);
    let refreshes=0;const refresh=async url=>{refreshes++;assert.match(url,/ig_refresh_token/);return response({access_token:'renewed-one',expires_in:5184000});};
    assert.deepEqual(await Promise.all([accountToken(f.store,accounts[0],refresh),accountToken(f.store,accounts[0],refresh)]),['renewed-one','renewed-one']);assert.equal(refreshes,1);
    assert.equal(JSON.parse(f.store.db.prepare('SELECT token FROM social_accounts WHERE id=?').get(accounts[1].id).token).access_token,'long-two');
    f.store.db.prepare('UPDATE social_accounts SET token=? WHERE id=?').run(JSON.stringify({access_token:'expired',expires_at:0}),accounts[0].id);
    await assert.rejects(()=>accountToken(f.store,accounts[0],refresh),/sona erdi/);assert.equal(refreshes,1);
    const state=await f.request('/api/social/state',null,'GET');assert.equal(JSON.stringify(state).includes('long-two'),false);
  }finally{f.close();restore();}
});

test('temporary media URLs are scoped to one asset, expire, and never expose account tokens',async()=>{
  const restore=publicMediaEnv();try{
    const {deliveryUrl,verifyDelivery,deliveryReady}=await import('../server/media-delivery.mjs');
    const id=randomUUID(),url=new URL(deliveryUrl({id}));assert.ok(verifyDelivery(id,url));assert.equal(verifyDelivery(randomUUID(),url),false);
    const changed=new URL(url);changed.searchParams.set('expires',String(Math.floor(Date.now()/1000)-1));assert.equal(verifyDelivery(id,changed),false);
    changed.searchParams.set('signature','a'.repeat(64));assert.equal(verifyDelivery(id,changed),false);
    assert.equal(verifyDelivery(id,new URL('https://studio.example.com')),false);
    for(const base of ['http://localhost:3000','https://127.0.0.1','https://192.168.1.2','https://172.16.0.1','https://mac.tail.ts.net']){process.env.PUBLIC_BASE_URL=base;assert.equal(deliveryReady(),false);assert.throws(()=>deliveryUrl({id}),/HTTPS/);}
  }finally{restore();}
});

test('Instagram images and Reels publish only after processing and use reviewed captions and account tokens',async()=>{
  const restore=publicMediaEnv();const f=fixture();try{
    const a=f.addAccount('instagram','creator');f.store.db.prepare('UPDATE social_accounts SET token=? WHERE id=?').run(JSON.stringify({access_token:'ig-own-token',expires_at:Date.now()+5184000000}),a.id);
    const folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());writeFileSync(join(folder,'reel.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const assets=f.store.db.prepare('SELECT * FROM media_library').all();
    for(const kind of ['post','reel']){
      const media=assets.find(item=>item.kind===(kind==='post'?'image':'video'));let calls=0,waits=0,published=0;
      const result=await publishSocial(f.store,{platform:'instagram',account_id:a.id,title:'',text:'Exact reviewed caption',options:JSON.stringify({kind,shareToFeed:true})},media,join(f.dir,'data'),async(url,options)=>{
        assert.equal(options.headers.Authorization,'Bearer ig-own-token');calls++;
        if(url.endsWith('/media')){assert.equal(options.body.get('caption'),'Exact reviewed caption');const signed=new URL(options.body.get(kind==='post'?'image_url':'video_url'));assert.match(signed.pathname,new RegExp(media.id));assert.ok(signed.searchParams.get('signature'));if(kind==='reel')assert.equal(options.body.get('media_type'),'REELS');return response({id:'container'});}
        if(url.includes('fields=status'))return response({status_code:calls===2?'IN_PROGRESS':'FINISHED'});
        if(url.endsWith('/media_publish')){published++;assert.equal(options.body.get('creation_id'),'container');return response({id:'remote-post'});}
        return response({permalink:'https://www.instagram.com/p/reviewed/'});
      },async ms=>{waits++;assert.equal(ms,60000);});
      assert.equal(result.id,'remote-post');assert.equal(result.url,'https://www.instagram.com/p/reviewed/');assert.equal(published,1);assert.equal(waits,1);
    }
  }finally{f.close();restore();}
});

test('Instagram rejects incompatible media and does not blindly retry ambiguous publish responses',async()=>{
  const restore=publicMediaEnv();const f=fixture();try{
    const account=f.addAccount('instagram','one');f.store.db.prepare('UPDATE social_accounts SET token=? WHERE id=?').run(JSON.stringify({access_token:'ig',expires_at:Date.now()+5184000000}),account.id);
    const folder=join(f.dir,'images');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get();let published=0;
    const fetchImpl=async url=>{if(url.endsWith('/media'))return response({id:'container'});if(url.includes('fields=status'))return response({status_code:'FINISHED'});published++;throw new Error('connection lost after publish');};
    const post={platform:'instagram',account_id:account.id,text:'Caption',options:'{"kind":"post"}'};
    await assert.rejects(()=>publishSocial(f.store,{...post,options:'{"kind":"reel"}'},media,join(f.dir,'data'),fetchImpl),/MP4/);assert.equal(published,0);
    await assert.rejects(()=>publishSocial(f.store,post,media,join(f.dir,'data'),fetchImpl,async()=>{}),error=>error.uncertain===true);assert.equal(published,1);
    let publishCalls=0;await assert.rejects(()=>publishSocial(f.store,post,media,join(f.dir,'data'),async url=>{if(url.endsWith('/media'))return response({id:'container'});if(url.includes('fields=status'))return response({status_code:'ERROR',status:'Unsupported ratio'});publishCalls++;return response({});},async()=>{}),/Unsupported ratio/);assert.equal(publishCalls,0);
  }finally{f.close();restore();}
});

test('TikTok photos use Direct Post with verified-domain delivery URL and creator consent',async()=>{
  const restore=publicMediaEnv();const f=fixture();try{
    const account=f.addAccount('tiktok','creator'),folder=join(f.dir,'images');mkdirSync(folder);writeFileSync(join(folder,'photo.jpg'),jpeg());await scanFolder(f.store,join(f.dir,'data'),folder);
    const media=f.store.db.prepare('SELECT * FROM media_library').get();let inits=0;
    const fetchImpl=async(url,options)=>{
      if(url.includes('creator_info'))return response({data:{creator_username:'creator',privacy_level_options:['SELF_ONLY'],comment_disabled:true},error:{code:'ok'}});
      if(url.includes('/content/init/')){inits++;const body=JSON.parse(options.body);assert.equal(body.media_type,'PHOTO');assert.equal(body.post_mode,'DIRECT_POST');assert.equal(body.post_info.description,'Reviewed photo caption');assert.equal(body.post_info.auto_add_music,true);assert.equal(body.post_info.disable_comment,true);assert.equal(body.source_info.photo_cover_index,0);assert.match(body.source_info.photo_images[0],/https:\/\/studio.example.com\/api\/social\/delivery\//);return response({data:{publish_id:'photo-job'},error:{code:'ok'}});}
      return response({data:{status:'PUBLISH_COMPLETE',publicaly_available_post_id:['photo123']},error:{code:'ok'}});
    };
    const post={platform:'tiktok',account_id:account.id,title:'Photo title',text:'Reviewed photo caption',options:JSON.stringify({privacy:'SELF_ONLY',consent:true,autoMusic:true})};
    const result=await publishSocial(f.store,post,media,join(f.dir,'data'),fetchImpl,async()=>{});assert.equal(result.url,'https://www.tiktok.com/@creator/photo/photo123');assert.equal(inits,1);
    await assert.rejects(()=>publishSocial(f.store,{...post,title:'x'.repeat(91)},media,join(f.dir,'data'),fetchImpl),/90 karakter/);assert.equal(inits,1);
    await assert.rejects(()=>publishSocial(f.store,{...post,options:'{"privacy":"SELF_ONLY","consent":false}'},media,join(f.dir,'data'),fetchImpl),/kabul edin/);assert.equal(inits,1);
  }finally{f.close();restore();}
});

test('YouTube custom thumbnail follows video publication and failures do not trigger another video upload',async()=>{
  const f=fixture();try{
    const account=f.addAccount('youtube','channel'),folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());writeFileSync(join(folder,'clip.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const image=f.store.db.prepare("SELECT * FROM media_library WHERE kind='image'").get(),video=f.store.db.prepare("SELECT * FROM media_library WHERE kind='video'").get();
    let starts=0,thumbnails=0;
    const fetchImpl=async(url,options)=>{if(url.includes('thumbnails/set')){thumbnails++;assert.match(url,/videoId=video-one/);assert.equal(options.headers['Content-Type'],'image/jpeg');assert.equal(options.body.size,jpeg().length);return response({items:[{}]});}if(options.method==='POST'){starts++;return new Response('',{headers:{location:'https://www.googleapis.com/upload/session'}});}return response({id:'video-one'});};
    const post={platform:'youtube',account_id:account.id,title:'Reviewed title',text:'Reviewed description',options:JSON.stringify({privacy:'private',thumbnailId:image.id})};
    assert.equal((await publishSocial(f.store,post,video,join(f.dir,'data'),fetchImpl)).id,'video-one');assert.equal(starts,1);assert.equal(thumbnails,1);
    const warning=await publishSocial(f.store,post,video,join(f.dir,'data'),(url,options)=>url.includes('thumbnails/set')?Promise.reject(new Error('thumbnail denied')):fetchImpl(url,options));
    assert.equal(warning.id,'video-one');assert.match(warning.warning,/Video yayınlandı/);assert.equal(starts,2);
  }finally{f.close();}
});

test('Instagram drafts enforce media kind, HTTPS delivery, English text generation, and per-account state',async()=>{
  const restore=publicMediaEnv();process.env.OPENAI_API_KEY='test-key';
  const f=fixture({fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body);assert.match(body.instructions,/English/);return aiResponse({title:'Your next idea',text:'Keep your next idea close.\n\nTry Notes today.'});}});
  try{
    const account=f.addAccount('instagram','creator'),folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());writeFileSync(join(folder,'clip.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const image=f.store.db.prepare("SELECT * FROM media_library WHERE kind='image'").get(),video=f.store.db.prepare("SELECT * FROM media_library WHERE kind='video'").get();
    let [post]=await f.create([{platform:'instagram',accountId:account.id}]);
    await assert.rejects(()=>f.save(post,{mediaId:video.id,options:{kind:'post'}}),/uygun değil/);
    post=await f.save(post,{mediaId:image.id,options:{kind:'post'}});
    const generated=await f.request(`/api/social/posts/${post.id}/generate`);assert.match(generated.post.text,/Keep your next idea/);
    process.env.PUBLIC_BASE_URL='http://localhost:3000';await assert.rejects(()=>f.request(`/api/social/posts/${post.id}/publish`),/HTTPS/);assert.equal(f.calls,0);
    process.env.PUBLIC_BASE_URL='https://studio.example.com';await f.request(`/api/social/posts/${post.id}/publish`);assert.equal(f.calls,1);
  }finally{f.close();restore();}
});

test('AI media selection respects Instagram post/Reels formats and resets TikTok consent on a new attachment',async()=>{
  const restore=publicMediaEnv();process.env.OPENAI_API_KEY='test-key';let candidates=[];
  const f=fixture({fetchImpl:async(_url,options)=>{candidates=JSON.parse(JSON.parse(options.body).input).candidates;return aiResponse({id:candidates[0].id,reason:'Relevant filename.'});}});
  try{
    const folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());writeFileSync(join(folder,'clip.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    let [post]=await f.create([{platform:'instagram'}]);
    let result=await f.request(`/api/social/posts/${post.id}/select-media`);assert.ok(candidates.every(item=>item.kind==='image'));assert.equal(result.post.media_id,candidates[0].id);
    post=await f.save(result.post,{mediaId:null,options:{kind:'reel'}});result=await f.request(`/api/social/posts/${post.id}/select-media`);assert.ok(candidates.every(item=>item.kind==='video'));
    const video=f.store.db.prepare("SELECT * FROM media_library WHERE kind='video'").get();
    let [tiktok]=await f.create([{platform:'tiktok'}]);tiktok=await f.save(tiktok,{mediaId:video.id,options:{privacy:'SELF_ONLY',consent:true,duration:60}});
    assert.equal(JSON.parse(tiktok.options).consent,false);assert.equal(JSON.parse(tiktok.options).duration,undefined);
    tiktok=await f.save(tiktok,{mediaId:video.id,options:{privacy:'SELF_ONLY',consent:true,duration:1}});assert.equal(JSON.parse(tiktok.options).consent,true);
    const image=f.store.db.prepare("SELECT * FROM media_library WHERE kind='image'").get();
    tiktok=await f.save(tiktok,{mediaId:image.id,options:JSON.parse(tiktok.options)});assert.equal(JSON.parse(tiktok.options).consent,false);assert.equal(JSON.parse(tiktok.options).duration,undefined);
  }finally{f.close();restore();}
});

test('recurring Instagram flow explicitly creates Reels and shared thumbnails wait for all attached posts',async()=>{
  const restore=publicMediaEnv();process.env.OPENAI_API_KEY='test-key';let observed;
  const f=fixture({publisher:async(_store,post)=>{observed=JSON.parse(post.options);return{id:'published-reel',url:'https://www.instagram.com/reel/one/'};},fetchImpl:async(_url,options)=>{const data=JSON.parse(JSON.parse(options.body).input);return data.candidates?aiResponse({id:data.candidates[0].id,reason:'Relevant video.'}):aiResponse({title:'Notes',text:'Keep your ideas close.'});}});
  try{
    const folder=join(f.dir,'mixed');mkdirSync(folder);writeFileSync(join(folder,'image.jpg'),jpeg());writeFileSync(join(folder,'clip.mp4'),mp4());await scanFolder(f.store,join(f.dir,'data'),folder);
    const account=f.addAccount('instagram','creator');const rule={enabled:true,context:'Notes',model:'gpt-6-luna',targets:[{platform:'instagram',accountId:account.id}],intervalHours:24,privacy:'private'};
    await f.request('/api/social/automation',rule);let saved=JSON.parse(f.store.getSetting.get('social_automation').value);f.store.setSetting.run('social_automation',JSON.stringify({...saved,nextAt:'2020-01-01T00:00:00.000Z'}));
    await f.studio.scheduler();assert.deepEqual(observed,{kind:'reel',shareToFeed:true});assert.equal(f.store.db.prepare('SELECT status FROM social_posts').get().status,'published');
    const image=f.store.db.prepare("SELECT * FROM media_library WHERE kind='image'").get(),youtube=f.addAccount('youtube','channel'),x=f.addAccount('x','another');
    let [yt,post]=await f.create([{platform:'youtube',accountId:youtube.id},{platform:'x',accountId:x.id}]);
    yt=await f.save(yt,{options:{privacy:'private',thumbnailId:image.id}});post=await f.save(post,{mediaId:image.id});
    f.store.db.prepare("UPDATE social_posts SET status='published' WHERE id=?").run(yt.id);await archiveMedia(f.store,join(f.dir,'data'),image.id);assert.ok(existsSync(join(folder,'image.jpg')));
    f.store.db.prepare("UPDATE social_posts SET status='published' WHERE id=?").run(post.id);await archiveMedia(f.store,join(f.dir,'data'),image.id);assert.equal(existsSync(join(folder,'image.jpg')),false);
  }finally{f.close();restore();}
});

test('existing media libraries upgrade without losing files or treating new uploads as AI generated',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const dir=mkdtempSync(join(tmpdir(),'studio-media-upgrade-'));
  let store;
  try{
    const legacy=new DatabaseSync(join(dir,'studio.sqlite'));
    legacy.exec("CREATE TABLE media_library (id TEXT PRIMARY KEY,name TEXT NOT NULL,source_path TEXT UNIQUE,stored_name TEXT NOT NULL,kind TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'available',created_at TEXT NOT NULL,error TEXT)");
    const id=randomUUID();legacy.prepare('INSERT INTO media_library (id,name,stored_name,kind,size,created_at) VALUES (?,?,?,?,?,?)').run(id,'Old AI image',`${randomUUID()}.jpg`,'image',300,'2026-01-01');legacy.close();
    store=openStore(dir);assert.equal(store.db.prepare('SELECT ai_generated FROM media_library WHERE id=?').get(id).ai_generated,1);
    const uploaded=randomUUID();store.db.prepare('INSERT INTO media_library (id,name,stored_name,kind,size,created_at) VALUES (?,?,?,?,?,?)').run(uploaded,'New upload',`${randomUUID()}.jpg`,'image',300,'2026-01-02');store.db.close();store=openStore(dir);
    assert.equal(store.db.prepare('SELECT ai_generated FROM media_library WHERE id=?').get(uploaded).ai_generated,0);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM media_library').get().n,2);
  }finally{store?.db.close();rmSync(dir,{recursive:true,force:true});}
});
