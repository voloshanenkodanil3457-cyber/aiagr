const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../source/providers.js'),C=require('../source/camera-movements.js');
test('OpenRouter uses the video API shape and preserves Omni reference types/audio/seed',()=>{
  const image='data:image/png;base64,YWJj',video='https://cdn.test/ref.mp4';
  const body=P.buildOpenRouterRequest({prompt:'Scene',model:'dreamina-seedance-2-5-260628',duration:10,resolution:'720p',ratio:'9:16',generate_audio:false,seed:0,reference_images:[image],reference_videos:[video]});
  assert.equal(body.model,'bytedance/seedance-2.5');assert.equal(body.aspect_ratio,'9:16');assert.equal(body.duration,10);assert.equal(body.generate_audio,false);assert.equal(body.seed,0);
  assert.deepEqual(body.input_references,[{type:'image_url',image_url:{url:image}},{type:'video_url',video_url:{url:video}}]);assert.equal(body.content,undefined);
  assert.equal(P.buildOpenRouterRequest({prompt:'Scene',ratio:'adaptive'}).aspect_ratio,undefined);
});
test('unsupported media and model capabilities fail before a paid request',()=>{
  for(const url of ['asset://asset-byteplus','blob:local','https://user:password@cdn.test/photo.jpg'])assert.throws(()=>P.buildOpenRouterRequest({prompt:'Scene',reference_images:[url]}));
  assert.throws(()=>P.buildOpenRouterRequest({prompt:'Scene',reference_videos:['data:video/mp4;base64,YWJj']}));
  const model={id:P.openRouterModel,supported_durations:[4,8],supported_resolutions:['720p'],supported_aspect_ratios:['9:16']};
  assert.throws(()=>P.validateCapabilities({resolution:'1080p'},model));assert.throws(()=>P.validateCapabilities({duration:10},model));assert.throws(()=>P.validateCapabilities({},null));
  assert.equal(P.validateCapabilities({resolution:'720p',duration:8,aspect_ratio:'9:16'},model).duration,8);assert.throws(()=>P.contentUrl('../other'));
});
test('all 46 supplied camera moves retain names, HTTPS videos and full prompts',()=>{
  assert.equal(C.clips.length,46);assert.equal(new Set(C.clips.map(c=>c.id)).size,46);assert.equal(new Set(C.clips.map(c=>c.url)).size,46);
  assert.deepEqual(Object.fromEntries(C.categories.map(k=>[k,C.clips.filter(c=>c.category===k).length])),{'Dolly/Track':9,'Zoom/Lens':6,'Drone/Crane':5,'Pan/Tilt':7,'Physical Moves':11,'Human Camera':2,Specials:6});
  for(const clip of C.clips){assert.ok(clip.prompt.startsWith('Camera: '));assert.ok(clip.prompt.includes('Movement:')&&clip.prompt.includes('Speed:')&&clip.prompt.includes('Framing:')&&clip.prompt.includes('End:'));assert.ok(clip.url.startsWith('https://aicameramovements.com/previews/hq/'));}
  assert.equal(C.get('02B').url,'https://aicameramovements.com/previews/hq/2b-pan-left-hq.mp4');assert.equal(C.filter('  orbit  ').length,2);assert.equal(C.filter('','Dolly/Track').length,9);
});
