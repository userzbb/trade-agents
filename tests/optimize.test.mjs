import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHyperoptJson } from '../skills/trade-assistant/scripts/optimize.mjs';

const sample = {
  strategy_name: 'RsiMomentum',
  params: {
    roi: { '0': 0.419, '265': 0.203, '710': 0.07, '1018': 0 },
    stoploss: { stoploss: -0.26 },
    trailing: { trailing_stop: true, trailing_stop_positive: 0.214, trailing_stop_positive_offset: 0.3, trailing_only_offset_is_reached: true },
  },
};

test('optimize: parseHyperoptJson 解析 stop/ROI/trailing', () => {
  const r = parseHyperoptJson(JSON.stringify(sample));
  assert.equal(r.stoploss, '-26.0%');
  assert.match(r.roi, /1018min→0\.0%/);
  assert.match(r.roi, /0min→41\.9%/);
  assert.match(r.trailing, /开 21\.40% \/ 激活偏移 30\.0%/);
});
