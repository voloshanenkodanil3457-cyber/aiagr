const {test,before,after,beforeEach}=require('node:test');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,query,where,getDocs,writeBatch,runTransaction}=require('firebase/firestore');
const {ref,uploadBytes,getBytes}=require('firebase/storage');
const fs=require('node:fs');let env;
const db=uid=>env.authenticatedContext(uid,{email:uid+'@example.test'}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-magic-tests',firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8085},storage:{rules:fs.readFileSync('storage.rules','utf8'),host:'127.0.0.1',port:9195}});});
after(async()=>{await env.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{
    const d=ctx.firestore();for(const [id,role]of [['alice','user'],['bob','user'],['boss','superuser'],['legacy','admin']])await setDoc(doc(d,'users',id),{email:id+'@example.test',displayName:id,role});
    for(const id of ['alice','bob','boss']){
      await setDoc(doc(d,'spaces',id),{ownerUid:id,name:id,memberUids:['boss']});
      await setDoc(doc(d,'assets',id),{uid:id,url:'private'});
      await setDoc(doc(d,'videos',id),{uid:id,status:'completed',prompt:'private',forUid:'alice'});
    }
  });
});
test('Spaces and source media remain private even from superuser',async()=>{
  await assertSucceeds(getDoc(doc(db('alice'),'spaces','alice')));
  for(const who of ['alice','boss']){
    await assertFails(getDoc(doc(db(who),'spaces','bob')));
    await assertFails(updateDoc(doc(db(who),'spaces','bob'),{name:'changed'}));
    await assertFails(getDoc(doc(db(who),'assets','bob')));
    await assertFails(getDocs(collection(db(who),'spaces')));
    await assertSucceeds(getDocs(query(collection(db(who),'spaces'),where('ownerUid','==',who))));
  }
});
test('only superuser sees all results/users; legacy assigned fields do not grant access',async()=>{
  await assertSucceeds(getDocs(collection(db('boss'),'videos')));
  await assertFails(getDoc(doc(db('alice'),'videos','bob')));
  await assertFails(getDocs(collection(db('alice'),'videos')));
  await assertSucceeds(getDocs(query(collection(db('alice'),'videos'),where('uid','==','alice'))));
  await assertFails(getDocs(collection(db('legacy'),'users')));
  await assertSucceeds(getDocs(collection(db('boss'),'users')));
});
test('role escalation blocked; superuser manages exactly two roles',async()=>{
  await assertFails(updateDoc(doc(db('alice'),'users','alice'),{role:'superuser'}));
  await assertFails(updateDoc(doc(db('alice'),'users','bob'),{role:'superuser'}));
  await assertSucceeds(updateDoc(doc(db('boss'),'users','bob'),{role:'superuser'}));
  await assertFails(updateDoc(doc(db('boss'),'users','alice'),{role:'admin'}));
  await assertFails(updateDoc(doc(db('boss'),'users','boss'),{role:'user'}));
  await assertSucceeds(setDoc(doc(db('boss'),'users','new'),{email:'new@example.test',displayName:'new',role:'user'}));
});
function resultBatch(uid,id,xp=49,overrides={}){
  const d=db(uid),batch=writeBatch(d);
  batch.set(doc(d,'videos',id),{uid,status:'completed',seconds:10,resolution:'720p',referenceCount:3,...overrides});
  batch.set(doc(d,'leaderboard',uid),{uid,nickname:uid,xp,completed:1,failed:0,lastVideoId:id,updatedAt:1});return batch;
}

test('first result transaction can read missing documents and publish a normal user result',async()=>{
  const d=db('alice'),video=doc(d,'videos','first-transaction'),score=doc(d,'leaderboard','alice'),deleted=doc(d,'videoDeletions','first-transaction');
  await assertSucceeds(runTransaction(d,async tx=>{
    const snapshots=await Promise.all([tx.get(video),tx.get(score),tx.get(deleted)]);
    for(const snapshot of snapshots)require('node:assert/strict').equal(snapshot.exists(),false);
    tx.set(video,{uid:'alice',status:'completed',seconds:10,resolution:'720p',referenceCount:3});
    tx.set(score,{uid:'alice',nickname:'alice',xp:49,completed:1,failed:0,lastVideoId:'first-transaction',updatedAt:1});
  }));
  await assertSucceeds(getDoc(doc(db('boss'),'videos','first-transaction')));
  await assertFails(getDoc(doc(db('bob'),'videos','first-transaction')));
  await assertFails(getDoc(doc(db('outsider'),'videos','missing')));
});
test('terminal result and accurate score must be atomic, cannot be replayed or inflated',async()=>{
  await assertFails(resultBatch('alice','r1',999).commit());
  await assertSucceeds(resultBatch('alice','r1').commit());
  await assertFails(resultBatch('alice','r1',98).commit());
  await assertFails(updateDoc(doc(db('alice'),'leaderboard','alice'),{xp:9999}));
  await assertFails(setDoc(doc(db('alice'),'videos','standalone'),{uid:'alice',status:'completed',seconds:8,resolution:'720p',referenceCount:0}));
  await assertSucceeds(getDocs(collection(db('bob'),'leaderboard')));
  await assertFails(getDoc(doc(db('bob'),'videos','r1')));
});
test('failed results increment errors and give zero XP; ownership cannot be forged',async()=>{
  const d=db('alice'),batch=writeBatch(d);
  batch.set(doc(d,'videos','error'),{uid:'alice',status:'failed',seconds:8,resolution:'720p',referenceCount:0});
  batch.set(doc(d,'leaderboard','alice'),{uid:'alice',nickname:'alice',xp:0,completed:0,failed:1,lastVideoId:'error',updatedAt:1});
  await assertSucceeds(batch.commit());
  await assertFails(resultBatch('alice','forged',49,{uid:'bob'}).commit());
  await assertFails(updateDoc(doc(d,'videos','error'),{uid:'bob'}));
});
test('old queued records can finish and be counted once; metadata only archive keeps history',async()=>{
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'videos','pending'),{uid:'alice',status:'queued'}));
  await assertSucceeds(resultBatch('alice','pending').commit());
  await assertSucceeds(updateDoc(doc(db('alice'),'videos','pending'),{archived:true}));
  await assertFails(updateDoc(doc(db('alice'),'videos','pending'),{status:'failed'}));
});

test('Storage isolates source media and lets superusers read only generated videos',async()=>{
  const ownStorage=env.authenticatedContext('alice').storage(),otherStorage=env.authenticatedContext('bob').storage(),adminStorage=env.authenticatedContext('boss').storage();
  await assertSucceeds(uploadBytes(ref(ownStorage,'users/alice/assets/input.png'),new Uint8Array([1,2]),{contentType:'image/png'}));
  await assertSucceeds(uploadBytes(ref(ownStorage,'users/alice/generations/out.mp4'),new Uint8Array([1,2]),{contentType:'video/mp4'}));
  await assertFails(getBytes(ref(otherStorage,'users/alice/assets/input.png')));
  await assertFails(getBytes(ref(adminStorage,'users/alice/assets/input.png')));
  await assertFails(getBytes(ref(otherStorage,'users/alice/generations/out.mp4')));
  await assertSucceeds(getBytes(ref(adminStorage,'users/alice/generations/out.mp4')));
  await assertFails(uploadBytes(ref(adminStorage,'users/alice/assets/hack.png'),new Uint8Array([1]),{contentType:'image/png'}));
});

test('an Auth token alone cannot create a team profile or access the application',async()=>{
  await assertFails(setDoc(doc(db('outsider'),'users','outsider'),{email:'outsider@example.test',displayName:'outsider',role:'user'}));
  await assertFails(setDoc(doc(db('outsider'),'spaces','new'),{ownerUid:'outsider'}));
  await assertFails(getDocs(collection(db('outsider'),'leaderboard')));
});

test('only superuser deletes terminal results atomically and stale results cannot return',async()=>{
  const erase=(uid,id,owner)=>{const d=db(uid),b=writeBatch(d);b.set(doc(d,'videoDeletions',id),{uid:owner});b.delete(doc(d,'videos',id));return b.commit();};
  await assertFails(deleteDoc(doc(db('boss'),'videos','bob')));
  await assertFails(erase('bob','bob','bob'));
  await assertFails(erase('boss','bob','alice'));
  await assertSucceeds(erase('boss','bob','bob'));
  await assertSucceeds(getDoc(doc(db('bob'),'videoDeletions','bob')));
  await assertFails(getDocs(collection(db('bob'),'videoDeletions')));
  await assertFails(deleteDoc(doc(db('boss'),'videoDeletions','bob')));
  await assertFails(resultBatch('bob','bob',10,{seconds:4,resolution:'480p',referenceCount:1}).commit());
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'videos','running'),{uid:'alice',status:'running'}));
  await assertFails(erase('boss','running','alice'));
});
