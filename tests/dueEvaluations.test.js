import { describe, expect, it } from 'vitest';

import { localParts, selectDueShops } from '../src/jobs/dueEvaluations.js';

// 2026-06-04T12:00:00+07:00 == 12:00 in Asia/Jakarta == minute-of-day 720, date 2026-06-04.
const NOW = new Date('2026-06-04T12:00:00+07:00');

describe('localParts', () => {
  it('returns the Jakarta date and minute-of-day', () => {
    expect(localParts(NOW, 'Asia/Jakarta')).toEqual({ date: '2026-06-04', minutes: 720 });
  });
});

describe('selectDueShops', () => {
  it('includes shops whose set time has passed and excludes future/already-run ones', () => {
    const shops = [
      { _id: 'a', evaluationSchedule: { hour: 10, minute: 0 } }, // 600 <= 720 -> due
      { _id: 'b', evaluationSchedule: { hour: 14, minute: 0 } }, // 840 > 720 -> not yet
      { _id: 'c', evaluationSchedule: { hour: 9, minute: 0 }, lastEvaluationDate: '2026-06-04' }, // already ran today
      { _id: 'd' }, // no schedule -> default 01:00 -> due
    ];

    const due = selectDueShops(shops, NOW).map((entry) => entry.shop._id);
    expect(due).toEqual(['a', 'd']);
  });

  it('stamps each due shop with its local date', () => {
    const due = selectDueShops([{ _id: 'a', evaluationSchedule: { hour: 8, minute: 0 } }], NOW);
    expect(due[0]).toMatchObject({ date: '2026-06-04' });
  });
});
