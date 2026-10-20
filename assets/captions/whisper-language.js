// Transformers.js 3.x defaults to English when language is omitted.
// Predict only the language token, then pass that language explicitly to ASR.
function languageError(text){return Object.assign(new Error(text),{code:'LANGUAGE_UNCERTAIN'});}
export function languageSample(audio){
  const frame=1600,limit=Math.min(audio.length,16000*60);let start=0;
  for(let offset=0;offset<limit;offset+=frame){let energy=0;const end=Math.min(audio.length,offset+frame);for(let i=offset;i<end;i++)energy+=audio[i]*audio[i];if(Math.sqrt(energy/Math.max(1,end-offset))>.008){start=Math.max(0,offset-4800);break;}}
  return audio.slice(start,Math.min(audio.length,start+16000*30));
}
export async function chooseLanguage(transcriber,audio,requested){
  const config=transcriber.model.generation_config,entries=Object.entries(config.lang_to_id||{}).map(([token,id])=>({code:token.replace(/^<\|/,'').replace(/\|>$/,''),id:Number(id)}));
  if(requested&&requested!=='auto')return {language:requested,automatic:false};
  const start=config.decoder_start_token_id??transcriber.model.config.decoder_start_token_id;
  if(!entries.length||!Number.isInteger(start))throw languageError('Автоопределение недоступно. Выбери язык речи вручную.');
  const allowed=new Set(entries.map(entry=>entry.id));let confidence=0;
  const languageOnly=(_ids,scores)=>{
    const size=scores.dims.at(-1),values=scores.data;let best=-Infinity;
    for(const entry of entries)best=Math.max(best,values[entry.id]);
    let total=0;for(const entry of entries)total+=Math.exp(values[entry.id]-best);
    confidence=total>0?1/total:0;
    for(let offset=0;offset<values.length;offset+=size)for(let token=0;token<size;token++)if(!allowed.has(token))values[offset+token]=-Infinity;
    return scores;
  };
  const {input_features}=await transcriber.processor(languageSample(audio));
  const result=await transcriber.model.generate({inputs:input_features,decoder_input_ids:[[start]],max_new_tokens:1,
    do_sample:false,num_beams:1,return_timestamps:false,return_token_timestamps:false,return_dict_in_generate:false,
    output_attentions:false,begin_suppress_tokens:[],suppress_tokens:[],logits_processor:[languageOnly]});
  const tokens=result.tolist()[0],detected=entries.find(entry=>entry.id===Number(tokens.at(-1)));
  if(!detected||confidence<.35)throw languageError('Не удалось уверенно определить язык. Выбери EN / ES / PT / RU или другой язык вручную и повтори распознавание.');
  return {language:detected.code,automatic:true,confidence};
}
