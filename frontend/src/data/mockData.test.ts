import { describe, it, expect } from 'vitest';
import { trees, analyzeTree, insightFor, allInsights, dailyReadingsFor } from './mockData';
import type { Status } from './types';

const rank: Record<Status, number> = { urgent: 0, watch: 1, ok: 2 };

describe('analyzeTree', () => {
  it('marks belowThreshold trees urgent', () => {
    for (const tree of trees) {
      const a = analyzeTree(tree.id);
      if (a.belowThreshold) expect(a.status).toBe('urgent');
    }
  });

  it('only computes daysToThreshold while declining fast and not already below', () => {
    for (const tree of trees) {
      const a = analyzeTree(tree.id);
      if (a.daysToThreshold !== null) {
        expect(a.decliningFast).toBe(true);
        expect(a.belowThreshold).toBe(false);
      }
    }
  });

  it('never reports a negative typical swing', () => {
    for (const tree of trees) {
      expect(analyzeTree(tree.id).typicalSwing).toBeGreaterThanOrEqual(0);
    }
  });

  it('flags decliningFast only when the drop clears both the multiplier and the absolute-move floor', () => {
    for (const tree of trees) {
      const a = analyzeTree(tree.id);
      if (a.decliningFast) {
        expect(a.changePct).toBeLessThan(0);
        expect(Math.abs(a.changePct)).toBeGreaterThan(Math.max(a.typicalSwing * 2, 3));
      }
    }
  });
});

describe('allInsights priority ranking', () => {
  it('orders urgent before watch before ok', () => {
    const insights = allInsights();
    for (let i = 1; i < insights.length; i++) {
      expect(rank[insights[i - 1].status]).toBeLessThanOrEqual(rank[insights[i].status]);
    }
  });

  it('returns exactly one insight per tree', () => {
    expect(allInsights()).toHaveLength(trees.length);
  });
});

describe('insightFor confidence derivation', () => {
  it('never assigns a confidence to a stable tree', () => {
    for (const tree of trees) {
      const insight = insightFor(tree.id);
      if (insight.status === 'ok') expect(insight.confidence).toBeUndefined();
    }
  });

  it('assigns high confidence for direct threshold breaches', () => {
    for (const tree of trees) {
      const a = analyzeTree(tree.id);
      const insight = insightFor(tree.id);
      if (a.belowThreshold || a.aboveThreshold) {
        expect(insight.confidence?.level).toBe('high');
      }
    }
  });

  it('scales confidence level with the change-to-typical-swing ratio for drying anomalies', () => {
    for (const tree of trees) {
      const a = analyzeTree(tree.id);
      const insight = insightFor(tree.id);
      if (a.decliningFast && !a.belowThreshold) {
        const ratio = a.typicalSwing > 0 ? Math.abs(a.changePct) / a.typicalSwing : Infinity;
        const expected = ratio >= 3 ? 'high' : ratio >= 1.5 ? 'medium' : 'low';
        expect(insight.confidence?.level).toBe(expected);
      }
    }
  });
});

describe('status consistency across derived views', () => {
  it('analyzeTree and insightFor never disagree on status', () => {
    for (const tree of trees) {
      expect(insightFor(tree.id).status).toBe(analyzeTree(tree.id).status);
    }
  });

  it('allInsights uses the same status as insightFor for each tree', () => {
    const insights = allInsights();
    for (const tree of trees) {
      const direct = insightFor(tree.id);
      const fromList = insights.find((i) => i.treeId === tree.id);
      expect(fromList?.status).toBe(direct.status);
    }
  });
});

describe('dailyReadingsFor', () => {
  it('returns the requested number of days in ascending date order', () => {
    const readings = dailyReadingsFor(trees[0].id, 10);
    expect(readings).toHaveLength(10);
    for (let i = 1; i < readings.length; i++) {
      expect(new Date(readings[i].date).getTime()).toBeGreaterThan(new Date(readings[i - 1].date).getTime());
    }
  });

  it('is deterministic for the same tree and day', () => {
    expect(dailyReadingsFor(trees[0].id, 5)).toEqual(dailyReadingsFor(trees[0].id, 5));
  });

  it('differs between trees (not a shared static fixture)', () => {
    const a = dailyReadingsFor(trees[0].id, 5);
    const b = dailyReadingsFor(trees[1].id, 5);
    expect(a).not.toEqual(b);
  });
});
