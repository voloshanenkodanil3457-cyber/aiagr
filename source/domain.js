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
  function estimateCost({seconds, resolution, videoReferenceCount = 0, pricingRates} = {}, rates = pricingRates || videoPrices) {
    const duration = Number(seconds), price = rates[resolution];
    if (!Number.isFinite(duration) || duration < 4 || duration > 30 || !price || Number(videoReferenceCount) > 0) return null;
    return Math.round(price * 1000000 * duration) / 1000000;
  }
  function videoCost(video) {
    if (video.cost != null && Number.isFinite(Number(video.cost)) && Number(video.cost) >= 0) return Number(video.cost);
    return video.status === 'completed' ? estimateCost(video, video.pricingRates || defaultVideoPrices) : null;
  }
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
      const cost = videoCost(v);
      if (cost != null) {
        out.cost = Math.round((out.cost + cost) * 1000000) / 1000000;
        if (v.cost == null || v.costSource === 'tariff') out.estimatedCostCount++;
      } else if (v.status === 'completed') out.unknownCost++;
      return out;
    }, { total: 0, completed: 0, failed: 0, running: 0, cost: 0, unknownCost: 0, xp: 0, estimatedCostCount: 0 });
  }
  function compatible(type, direction) {
    if (direction === 'in') return { generation: ['media', 'preset'], text: ['preset'], output: ['generation'] }[type] || [];
    return { generation: ['output'], media: ['generation'], camera: ['generation'], preset: ['generation', 'text'], text: ['generation'] }[type] || [];
  }
  return { xp, totals, terminal, compatible, resolutions, defaultVideoModel, normalizeBytePlusModel, get videoPrices(){return {...videoPrices};}, defaultVideoPrices, pricingVersion, estimateCost, videoCost, money, validatePrices, setVideoPrices };
})();
