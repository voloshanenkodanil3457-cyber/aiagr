'use strict';
// Shared, side-effect-free generation rules. Also used by the tests.
window.MagicDomain = (() => {
  const defaultVideoModel = 'dreamina-seedance-2-5-260628';
  function normalizeBytePlusModel(value, fallback = defaultVideoModel) {
    const model = String(value || '').trim() || String(fallback || '').trim();
    // Old graphs stored a display slug rather than a ModelArk model ID.
    // Preserve explicit versioned IDs and custom endpoint IDs.
    return !model || /^(?:dreamina[-\s])?seedance[-\s]?2[.-]5$/i.test(model) ? defaultVideoModel : model;
  }
  const resolutions = { '480p': 1, '720p': 1.5, '1080p': 2 };
  const terminal = status => ['completed', 'failed', 'cancelled'].includes(status);
  const defaultVideoPrices = Object.freeze({ '480p': .103, '720p': .231, '1080p': .569 });
  let videoPrices = {...defaultVideoPrices};
  const pricingVersion = 'seedance-2.5-per-second-v1';
  function validatePrices(prices) {
    const result={};
    for(const resolution of Object.keys(defaultVideoPrices)){
      const price=Number(prices?.[resolution]);
      if(!Number.isFinite(price)||price<=0||price>100)throw new Error('Тариф должен быть больше 0 и не выше $100 за секунду.');
      result[resolution]=Math.round(price*1000000)/1000000;
      if(result[resolution]<=0)throw new Error('Минимальный тариф — $0.000001 за секунду.');
    }
    return result;
  }
  function setVideoPrices(prices){videoPrices=validatePrices(prices);return {...videoPrices};}
  function higgsfieldCost({model,seconds,resolution,ratio='16:9',videoReferenceCount=0,inputVideoSeconds,discount=0,sourceSeconds,taskMode}={}){
    const version=/seedance-2\.0(?:\/|$)/.test(model||'')?'2.0':/seedance-2\.5(?:\/|$)/.test(model||'')?'2.5':null;
    const dims={'480p':{'16:9':[854,480],'4:3':[752,560],'1:1':[640,640],'21:9':[992,432]},'720p':{'16:9':[1280,720],'4:3':[1112,834],'1:1':[960,960],'21:9':[1470,630]},'1080p':{'16:9':[1920,1080],'4:3':[1664,1248],'1:1':[1440,1440],'21:9':[2206,946]}};
    const aspect=ratio==='9:16'?'16:9':ratio==='3:4'?'4:3':ratio,dimensions=version==='2.0'&&resolution==='480p'&&aspect==='16:9'?[864,496]:dims[resolution]?.[aspect],hasVideo=Number(videoReferenceCount)>0;
    const input=hasVideo?Number(inputVideoSeconds):0,duration=taskMode==='edit'?Number(sourceSeconds):Number(seconds),off=Number(discount);
    if(!version||!dimensions||!Number.isFinite(duration)||duration<4||duration>(version==='2.0'?15:30)||!Number.isFinite(off)||off<0||off>100||hasVideo&&(inputVideoSeconds==null||!Number.isFinite(input)||input<=0||input>(version==='2.0'?15:30)))return null;
    const tokens=Math.ceil(dimensions[0]*dimensions[1]*24*(duration+input)/1024),rate=version==='2.0'?.014:resolution==='1080p'?.0234:.0214;
    return Math.round(tokens/1000*rate*(hasVideo?.6:1)*(1-off/100)*1000000)/1000000;
  }
  function estimateCost({provider, seconds, resolution, videoReferenceCount = 0, pricingRates,...rest} = {}, rates = pricingRates || videoPrices) {
    if(provider==='higgsfield')return higgsfieldCost({...rest,seconds,resolution,videoReferenceCount});
    const duration = Number(seconds), price = rates[resolution];
    if (!Number.isFinite(duration) || duration < 4 || duration > 30 || !price || Number(videoReferenceCount) > 0) return null;
    return Math.round(price * 1000000 * duration) / 1000000;
  }
  const validCost = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value)>=0;
  function costInfo(video){
    const correction=video.billingCorrection;
    if(correction&&correction.requestId===video.requestId&&correction.uid===video.uid&&validCost(correction.amount))return {amount:Number(correction.amount),kind:'confirmed',source:'manual_billing'};
    if(validCost(video.cost)){
      // Legacy Higgsfield `cost` can be a quote. Never present it as a debit.
      const estimated=['tariff','higgsfield_tariff','api_estimate'].includes(video.costSource)||video.provider==='higgsfield'&&video.costSource!=='billing_api';
      return {amount:Number(video.cost),kind:estimated?'estimated':'confirmed',source:video.costSource||'api'};
    }
    if(video.status==='completed'&&video.estimateSource==='api_estimate'&&validCost(video.estimatedCost))return {amount:Number(video.estimatedCost),kind:'estimated',source:'api_estimate'};
    const amount=video.status==='completed'?estimateCost(video,video.pricingRates||defaultVideoPrices):null;
    return {amount,kind:amount==null?'unknown':'estimated',source:amount==null?null:'tariff'};
  }
  function videoCost(video){return costInfo(video).amount;}
  function costLabel(video){const info=costInfo(video);return info.amount==null?'Стоимость неизвестна':money(info.amount)+(info.kind==='estimated'?' ≈':'');}
  function totalCostLabel(stats){return (stats.unknownCost&&stats.cost===0?'—':money(stats.cost)+(stats.estimatedCostCount?' ≈':''))+(stats.unknownCost?' · неполный итог':'');}
  const money = (value, precision=4) => '$' + Number(value || 0).toFixed(precision).replace(/(\.\d{2,}?)0+$/, '$1');
  function xp({ seconds = 4, resolution = '480p', referenceCount = 1 } = {}) {
    const duration = Math.max(4, Math.min(30, Number(seconds) || 4));
    // Text-only generations use the base reference multiplier, not a penalty.
    const refs = Math.max(1, Math.min(15, Number(referenceCount) || 1));
    return Math.round(10 * (duration / 4) * (resolutions[resolution] || 1) * (1 + .15 * (refs - 1)));
  }
  function totals(videos) {
    return videos.reduce((out, v) => {
      out.total++;
      if (v.status === 'completed') { out.completed++; out.xp += xp(v); }
      if (v.status === 'failed') out.failed++;
      if (!terminal(v.status)) out.running++;
      const info=costInfo(v),cost=info.amount;
      if (cost != null) {
        out.cost = Math.round((out.cost + cost) * 1000000) / 1000000;
        if(info.kind==='estimated'){out.estimatedCostCount++;out.estimatedCost=Math.round((out.estimatedCost+cost)*1000000)/1000000;}else{out.confirmedCostCount++;out.confirmedCost=Math.round((out.confirmedCost+cost)*1000000)/1000000;}
      } else if (v.status === 'completed') out.unknownCost++;
      return out;
    }, { total: 0, completed: 0, failed: 0, running: 0, cost: 0, unknownCost: 0, xp: 0, estimatedCostCount: 0, estimatedCost:0, confirmedCost:0, confirmedCostCount:0 });
  }
  function compatible(type, direction) {
    if (direction === 'in') return { generation: ['media', 'preset'], text: ['preset'], output: ['generation'] }[type] || [];
    return { generation: ['output'], media: ['generation'], camera: ['generation'], preset: ['generation', 'text'], text: ['generation'] }[type] || [];
  }
  return { costInfo,costLabel,totalCostLabel,higgsfieldCost,xp, totals, terminal, compatible, resolutions, defaultVideoModel, normalizeBytePlusModel, get videoPrices(){return {...videoPrices};}, defaultVideoPrices, pricingVersion, estimateCost, videoCost, money, validatePrices, setVideoPrices };
})();
