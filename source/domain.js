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
      if (v.cost != null && Number.isFinite(Number(v.cost))) out.cost += Number(v.cost);
      else if (terminal(v.status)) out.unknownCost++;
      return out;
    }, { total: 0, completed: 0, failed: 0, running: 0, cost: 0, unknownCost: 0, xp: 0 });
  }
  function compatible(type, direction) {
    if (direction === 'in') return { generation: ['media', 'preset'], text: ['preset'], output: ['generation'] }[type] || [];
    return { generation: ['output'], media: ['generation'], camera: ['generation'], preset: ['generation', 'text'], text: ['generation'] }[type] || [];
  }
  return { xp, totals, terminal, compatible, resolutions, defaultVideoModel, normalizeBytePlusModel };
})();
