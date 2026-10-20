'use strict';
window.MagicEditor=(()=>{
  function schedule(clips){
    if(clips.length>20||clips.reduce((sum,c)=>sum+(Number(c.out)-Number(c.in))/(c.speed||1),0)>300.001)throw Error('Максимум 20 клипов и 5 минут общей длины.');
    let end=0;
    return clips.map((clip,index)=>{
      const speed=Number(clip.speed||1),duration=(Number(clip.out)-Number(clip.in))/speed;
      if(!Number.isFinite(speed)||speed<.25||speed>4)throw Error('Скорость должна быть от 0,25× до 4×.');
      if(!Number.isFinite(duration)||duration<.1||clip.in<0||clip.out>clip.duration+.001)throw Error('Проверь границы обрезки. Минимум — 0,1 секунды.');
      const previous=clips[index-1];
      const overlap=index&&clip.transition!=='cut'?Math.min(Math.max(0,Number(clip.fade)||0),duration/2,(previous.out-previous.in)/(previous.speed||1)/2):0;
      const start=end-overlap;end=start+duration;
      return {...clip,index,start,end,length:duration,overlap};
    });
  }
  function frame(plan,time){
    const active=plan.filter(c=>time>=c.start&&time<c.end).map(c=>({...c,sourceTime:c.in+(time-c.start)*(c.speed||1),alpha:1,gain:1}));
    if(active.length===2){
      const [a,b]=active,p=Math.max(0,Math.min(1,(time-b.start)/b.overlap));
      if(b.transition==='black'){a.alpha=Math.max(0,1-p*2);b.alpha=Math.max(0,p*2-1);}else b.alpha=p;
      a.gain=1-p;b.gain=p;
    }
    return active;
  }
  function move(clips,from,to){const result=clips.slice();result.splice(to,0,result.splice(from,1)[0]);return result;}
  function audioPlan(items){return items.map(c=>{const length=c.out-c.in,start=Number(c.offset)||0;if(!Number.isFinite(length)||length<.1||c.in<0||c.out>c.duration+.001||start<0||start+length>300.001)throw Error('Аудио должно укладываться в 5 минут; проверь границы.');return {...c,start,end:start+length,length};});}
  function audioFrame(plan,time){return plan.filter(c=>time>=c.start&&time<c.end).map(c=>({...c,sourceTime:c.in+time-c.start,gain:Math.min(1,c.fadeIn?(time-c.start)/Math.min(c.length,c.fadeIn):1,c.fadeOut?(c.end-time)/Math.min(c.length,c.fadeOut):1)}));}
  function fadePoints(length,fadeIn=0,fadeOut=0,volume=1){const a=Math.min(length,fadeIn),b=Math.min(length,fadeOut);if(a+b>length)return [[0,0],[length*a/(a+b),volume*length/(a+b)],[length,0]];const points=[[0,a?0:volume]];if(a)points.push([a,volume]);if(b){points.push([length-b,volume],[length,0]);}return points;}
  function parseSubtitles(text,duration){
    const parse=s=>s.replace(',','.').split(':').map(Number).reduce((n,v)=>n*60+v,0),words=[];
    for(const block of String(text).replace(/\r/g,'').split(/\n\s*\n/)){const lines=block.split('\n'),i=lines.findIndex(s=>s.includes('-->'));if(i<0)continue;const pair=lines[i].split('-->'),start=parse(pair[0].trim()),end=parse(pair[1].trim().split(/\s/)[0]),tokens=lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').trim().split(/\s+/).filter(Boolean);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.001)continue;tokens.forEach((text,j)=>words.push({text,start:start+(end-start)*j/tokens.length,end:start+(end-start)*(j+1)/tokens.length}));}
    return words.sort((a,b)=>a.start-b.start);
  }
  function isYouTube(url){try{const h=new URL(url).hostname.toLowerCase();return h==='youtu.be'||h==='youtube.com'||h.endsWith('.youtube.com')||h==='youtube-nocookie.com'||h.endsWith('.youtube-nocookie.com');}catch{return false;}}
  function wavePCM(buffer){const channels=Math.min(2,buffer.numberOfChannels),size=buffer.length*channels*2,data=new ArrayBuffer(44+size),v=new DataView(data),str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+size,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size,true);const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let offset=44;for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++){const sample=Math.max(-1,Math.min(1,samples[c][i]));v.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}return data;}
  return {schedule,frame,move,audioPlan,audioFrame,fadePoints,parseSubtitles,isYouTube,wavePCM};
})();
