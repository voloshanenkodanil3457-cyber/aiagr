// Browser test double. Used only by the Playwright harness, never bundled into the site.
(()=>{
  const get=(k,f)=>JSON.parse(localStorage.getItem('qa.'+k)||'null')??f;
  const put=(k,v)=>localStorage.setItem('qa.'+k,JSON.stringify(v));
  if(!get('docs',null)){
    put('uid','alice');put('docs',{
      'users/alice':{role:'superuser',displayName:'Dan',email:'dan@example.test'},
      'users/bob':{role:'user',displayName:'Bob',email:'bob@example.test'},
      'spaces/first':{ownerUid:'alice',name:'Studio launch',createdAt:1,canvasState:null},
      'spaces/private':{ownerUid:'bob',name:'BOB PRIVATE SPACE',createdAt:1,canvasState:null},
      'videos/bob-video':{uid:'bob',user:'Bob',status:'completed',videoUrl:null,prompt:'BOB PRIVATE PROMPT',resolution:'480p',seconds:4,referenceCount:1,cost:.2,createdAt:1,spaceId:'private'},
      'leaderboard/bob':{uid:'bob',nickname:'Bob',xp:10,completed:1,failed:0}
    });
    localStorage.setItem('magic.credentials.alice.apiKey','TEST-KEY');
    localStorage.setItem('magic.credentials.bob.apiKey','TEST-KEY-BOB');
  }
  const stats=(key,n=1)=>{const m=get('metrics',{reads:0,writes:0,storage:0,queries:[]});m[key]=(m[key]||0)+n;put('metrics',m);};
  function ref(...parts){let path;if(parts.length===1&&parts[0].path)path=parts[0].path+'/'+crypto.randomUUID();else path=parts.slice(1).join('/');return {path,id:path.split('/').pop()};}
  const snap=(r)=>{const data=get('docs',{})[r.path];return {id:r.id,exists:()=>!!data,data:()=>structuredClone(data)};};
  const auths=new Map();
  const authUser=id=>id?{uid:id,email:get('docs',{})['users/'+id]?.email||id+'@example.test',getIdToken:async()=> 'test-id-token'}:null;
  const write=(r,data,merge=false)=>{stats('writes');const docs=get('docs',{});docs[r.path]=merge?{...docs[r.path],...data}:data;put('docs',docs);};
  const sdk={
    initializeApp:(config,name='default')=>({name}),deleteApp:async()=>{},
    getAuth:app=>{if(!auths.has(app.name))auths.set(app.name,{currentUser:app.name==='default'?authUser(get('uid',null)):null,name:app.name});return auths.get(app.name);},
    setPersistence:async()=>{},onAuthStateChanged:(auth,cb)=>{queueMicrotask(()=>cb(auth.currentUser));return()=>{};},
    signInWithEmailAndPassword:async(auth,email)=>{const entry=Object.entries(get('docs',{})).find(([k,v])=>k.startsWith('users/')&&v.email===email);if(!entry)throw new Error('auth/invalid-credential');const id=entry[0].split('/')[1];auth.currentUser=authUser(id);if(auth.name==='default')put('uid',id);return {user:auth.currentUser};},
    createUserWithEmailAndPassword:async(auth,email)=>{const u={uid:'created-'+crypto.randomUUID(),email};auth.currentUser=u;return {user:u};},
    signOut:async(auth)=>{auth.currentUser=null;if(auth.name==='default')put('uid',null);},deleteUser:async()=>{},
    getFirestore:()=>({}),getStorage:()=>({}),doc:ref,collection:ref,
    query:(col,...constraints)=>({...col,constraints}),where:(field,op,value)=>({field,op,value}),
    getDoc:async r=>{stats('reads');return snap(r);},
    getDocs:async q=>{stats('reads');const m=get('metrics',{});m.queries.push({path:q.path,constraints:q.constraints||[]});put('metrics',m);
      const docs=Object.entries(get('docs',{})).filter(([path,v])=>path.startsWith(q.path+'/')&&!path.slice(q.path.length+1).includes('/')&&(q.constraints||[]).every(c=>c.op==='array-contains'?(v[c.field]||[]).includes(c.value):v[c.field]===c.value)).map(([path])=>snap({path,id:path.split('/').pop()}));return {docs,forEach:fn=>docs.forEach(fn)};},
    setDoc:async(r,data,options)=>write(r,data,options?.merge),updateDoc:async(r,data)=>{if(!get('docs',{})[r.path])throw new Error('not-found');write(r,data,true);},deleteDoc:async r=>{const docs=get('docs',{});delete docs[r.path];stats('writes');put('docs',docs);},
    writeBatch:()=>{const ops=[];return {set:(r,d,o)=>ops.push(()=>write(r,d,o?.merge)),update:(r,d)=>ops.push(()=>write(r,d,true)),commit:async()=>ops.forEach(fn=>fn())};},
    runTransaction:async(database,callback)=>{
      const previous=window.__qa.transaction||Promise.resolve();let release;window.__qa.transaction=new Promise(r=>release=r);await previous;
      try{const ops=[];await callback({get:sdk.getDoc,set:(r,d)=>ops.push(()=>write(r,d)),update:(r,d)=>ops.push(()=>write(r,d,true)),delete:r=>ops.push(()=>sdk.deleteDoc(r))});for(const op of ops)await op();}finally{release();}
    },
    ref,uploadBytes:async()=>{stats('storage');throw new Error('Firebase Storage unavailable on Spark');},getDownloadURL:async r=>location.origin+'/qa-media/'+r.id,deleteObject:async()=>{}
  };
  window.__qa={sdk,get,put,reset:()=>put('metrics',{reads:0,writes:0,storage:0,queries:[]})};
})();
