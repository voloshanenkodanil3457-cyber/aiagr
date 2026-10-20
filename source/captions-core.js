'use strict';
// Pure subtitle operations shared by the editor, renderer and regression tests.
window.MagicCaptions = (() => {
  function normalize(chunks,duration){
    if(!Number.isFinite(duration)||duration<=0)return [];
    const result=[];
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i],text=String(chunk.text||'').trim();if(!text)continue;
      const pair=chunk.timestamp||[chunk.start,chunk.end];
      let start=pair[0]==null?(result.at(-1)?.end||0):Number(pair[0]);
      let end=pair[1]==null?(chunks[i+1]?.timestamp?.[0]??duration):Number(pair[1]);
      if(!Number.isFinite(start)||!Number.isFinite(end))continue;
      start=Math.max(result.at(-1)?.end||0,Math.min(duration,start));end=Math.min(duration,Math.max(start+.02,end));
      if(end>start)result.push({start,end,text});
    }
    return result;
  }
  function draft(text,duration){
    const words=String(text||'').trim().split(/\s+/).filter(Boolean);
    if(!words.length||!Number.isFinite(duration)||duration<=0)return [];
    return words.map((text,i)=>({text,start:i*duration/words.length,end:(i+1)*duration/words.length}));
  }
  function validate(cues,duration){
    if(!Number.isFinite(duration)||duration<=0)throw new Error('Видео ещё не готово.');
    let previousEnd=0;
    for(const cue of cues){
      if(!String(cue.text||'').trim())throw new Error('Текст субтитра не должен быть пустым.');
      if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<previousEnd-.001||cue.end<=cue.start||cue.end>duration+.001)throw new Error('Проверь таймкоды: конец должен быть позже начала, интервалы не должны пересекаться или выходить за видео.');
      previousEnd=cue.end;
    }
    return cues;
  }
  function groups(cues,size=4){
    const result=[];let group=[];
    const flush=()=>{if(group.length){result.push({start:group[0].start,end:group.at(-1).end,text:group.map(c=>c.text).join(' '),words:group});group=[];}};
    for(const cue of cues){if(group.length&&(group.length>=size||cue.start-group.at(-1).end>1))flush();group.push(cue);if(/[.!?…]$/.test(cue.text))flush();}flush();return result;
  }
  function time(value,separator=','){
    const ms=Math.max(0,Math.round(Number(value)*1000)),pad=n=>String(n).padStart(2,'0');
    return pad(Math.floor(ms/3600000))+':'+pad(Math.floor(ms/60000)%60)+':'+pad(Math.floor(ms/1000)%60)+separator+String(ms%1000).padStart(3,'0');
  }
  function serialize(cues,format='srt'){
    const vtt=format==='vtt';
    const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return (vtt?'WEBVTT\n\n':'')+groups(cues).map((c,i)=>(vtt?'':(i+1)+'\n')+time(c.start,vtt?'.':',')+' --> '+time(c.end,vtt?'.':',')+'\n'+(vtt?escape(c.text):c.text.replace(/\r?\n/g,' '))+'\n').join('\n');
  }
  function active(cues,position){return cues.findIndex(c=>position>=c.start&&position<c.end);}
  return {normalize,draft,validate,groups,time,serialize,active};
})();
