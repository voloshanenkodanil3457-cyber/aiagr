// All inference stays in this browser worker. Only public model files are downloaded.
let transcriber;
self.onmessage=async({data})=>{
  const {id,audio,language}=data;
  try{
    self.postMessage({id,type:'status',text:'Загрузка Whisper · первый запуск требует скачивания модели…'});
    if(!transcriber){
      const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js');
      env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;
      transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{device:'wasm',dtype:'q8',progress_callback:progress=>{
        if(progress.status==='progress')self.postMessage({id,type:'progress',text:'Загрузка модели: '+Math.round(progress.progress||0)+'% · '+(progress.file||'')});
      }});
    }
    self.postMessage({id,type:'status',text:'Распознавание на твоём устройстве… Можно отменить.'});
    const options={task:'transcribe',return_timestamps:'word',chunk_length_s:25,stride_length_s:5};
    if(language!=='auto')options.language=language;
    const result=await transcriber(audio,options);
    self.postMessage({id,type:'result',chunks:result.chunks||[],text:result.text||''});
  }catch(error){transcriber=null;self.postMessage({id,type:'error',text:error.message||String(error)});}
};
