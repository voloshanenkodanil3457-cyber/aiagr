const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('source/canvas.js','utf8'),c=vm.createContext({});
vm.runInContext(code.slice(code.indexOf('  function magneticMove('),code.indexOf('  function showSnapGuides('))+'this.snap=magneticMove;',c);
test('snaps centers and edges at a constant six screen pixel distance across zoom levels',()=>{
 const a=[{x:0,y:0,width:1000,height:1000}],other=[{x:200,y:200,width:1000,height:1000}];
 for(const zoom of [.15,.5,1,3]){const r=c.snap(a,200+5/zoom,200,zoom,other);assert.ok(Math.abs(r.dx-200)<1e-8);assert.equal(r.dy,200);assert.equal(r.guides.length,2);assert.equal(r.guides[0].line,700);}
 const far=c.snap(a,213,213,1,other);assert.equal(far.dx,213);assert.equal(far.guides.length,0);
});
test('uses different node dimensions, includes distant aligned nodes and preserves group spacing',()=>{
 const target=[{x:400,y:-1000,width:300,height:400}],a=[{x:0,y:0,width:100,height:100}];
 const r=c.snap(a,498,0,1,target);assert.equal(r.dx,500);assert.equal(r.guides[0].line,550);assert.ok(r.guides[0].start<-1000);
 const group=[{x:0,y:0,width:100,height:100},{x:180,y:200,width:100,height:100}];const g=c.snap(group,202,0,1,[{x:200,y:900,width:100,height:100}]);assert.equal(g.dx,200);assert.equal((group[1].x+g.dx)-(group[0].x+g.dx),180);
});
test('Alt disables both corrections and guides; empty canvas has no snapping',()=>{
 const a=[{x:0,y:0,width:100,height:100}],b=[{x:200,y:200,width:100,height:100}];
 for(const r of [c.snap(a,203,204,1,b,true),c.snap(a,203,204,1,[])]){assert.equal(r.dx,203);assert.equal(r.dy,204);assert.equal(r.guides.length,0);}
});
