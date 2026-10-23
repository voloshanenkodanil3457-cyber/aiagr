const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync('source/canvas.js','utf8');
test('alignment uses node dimensions and supports undo through a single mutation',()=>{
 const a={id:'M1',x:10,y:20,el:{offsetWidth:200,offsetHeight:300}},b={id:'G1',x:400,y:80,el:{offsetWidth:360,offsetHeight:180}},nodes=new Map([['M1',a],['G1',b]]),selected=new Set(nodes.keys());let commits=0;
 const c={nodes,selected,finishEdit(){},mutate(label,fn){commits++;fn();},moveNode(n,x,y){n.x=x;n.y=y;},schedule(){}};vm.createContext(c);
 vm.runInContext(code.slice(code.indexOf('  function selectionBounds('),code.indexOf('  function paintSelection('))+code.slice(code.indexOf('  function alignSelection('),code.indexOf("  $('#selection-actions').addEventListener"))+'this.align=alignSelection;',c);
 c.align('center-y');assert.equal(a.y+150,b.y+90);assert.equal(a.x,10);assert.equal(b.x,400);assert.equal(commits,1);
 c.align('right');assert.equal(a.x+200,b.x+360);
 c.align('center-x');assert.equal(a.x+100,b.x+180);
});
test('Ctrl wheel over a node input cancels page zoom and zooms canvas at cursor',()=>{
 let listener,options,zoom;const c={document:{addEventListener:(name,fn,o)=>{listener=fn;options=o;}},camera:{zoom:1},viewport:{clientHeight:600},zoomAt:(...args)=>zoom=args};vm.createContext(c);
 const start=code.indexOf("  document.addEventListener('wheel',");vm.runInContext(code.slice(start,code.indexOf("  viewport.addEventListener('wheel',",start)),c);
 let prevented=false,stopped=false;listener({ctrlKey:true,metaKey:false,target:{closest:()=>true},deltaY:-100,deltaMode:0,clientX:300,clientY:200,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(options.capture,true);assert.equal(options.passive,false);assert.ok(zoom[0]>1);assert.equal(zoom[1],300);assert.equal(zoom[2],200);
 zoom=null;listener({ctrlKey:false,metaKey:false});assert.equal(zoom,null);
});
