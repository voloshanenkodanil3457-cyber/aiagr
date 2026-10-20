'use strict';
window.MagicEditor=(()=>{
  function schedule(clips){
    if(clips.length>20||clips.reduce((sum,c)=>sum+Number(c.out)-Number(c.in),0)>300.001)throw Error('Максимум 20 клипов и 5 минут общей длины.');
    let end=0;
    return clips.map((clip,index)=>{
      const duration=Number(clip.out)-Number(clip.in);
      if(!Number.isFinite(duration)||duration<.1||clip.in<0||clip.out>clip.duration+.001)throw Error('Проверь границы обрезки. Минимум — 0,1 секунды.');
      const previous=clips[index-1];
      const overlap=index&&clip.transition!=='cut'?Math.min(Math.max(0,Number(clip.fade)||0),duration/2,(previous.out-previous.in)/2):0;
      const start=end-overlap;end=start+duration;
      return {...clip,index,start,end,length:duration,overlap};
    });
  }
  function frame(plan,time){
    const active=plan.filter(c=>time>=c.start&&time<c.end).map(c=>({...c,sourceTime:c.in+time-c.start,alpha:1,gain:1}));
    if(active.length===2){
      const [a,b]=active,p=Math.max(0,Math.min(1,(time-b.start)/b.overlap));
      if(b.transition==='black'){a.alpha=Math.max(0,1-p*2);b.alpha=Math.max(0,p*2-1);}else b.alpha=p;
      a.gain=1-p;b.gain=p;
    }
    return active;
  }
  function move(clips,from,to){const result=clips.slice();result.splice(to,0,result.splice(from,1)[0]);return result;}
  return {schedule,frame,move};
})();
