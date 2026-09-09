import { describe, expect, it } from 'vitest';
import { BarSeries } from '../src/model/bars.js';
import { PriceScale } from '../src/model/price-scale.js';
import { TimeScale } from '../src/model/time-scale.js';
import { CandleGeometry, buildCandleGeometry, candleBodyWidth, niceStep } from '../src/render/geometry.js';
import { randomWalk } from './helpers.js';

function setup(barCount = 500) {
    const bars = new BarSeries();
    bars.setData(randomWalk(barCount, 4));

    const timeScale = new TimeScale({ barSpacing: 10 });
    timeScale.setWidth(800);
    timeScale.setBarCount(bars.length);

    const priceScale = new PriceScale();
    priceScale.setHeight(400);
    const visible = timeScale.visibleBars();
    const { min, max } = bars.lowHighInRange(visible.from, visible.to);
    priceScale.autoScale(min, max);

    return { bars, timeScale, priceScale, visible };
}

describe('candleBodyWidth', () => {
    it('всегда нечётная, чтобы однопиксельная тень не размывалась', () => {
        for (const spacing of [1, 2, 3, 5, 8, 13, 21, 100]) {
            expect(candleBodyWidth(spacing) % 2).toBe(1);
        }
    });

    it('не опускается ниже одного пикселя', () => {
        expect(candleBodyWidth(0.1)).toBe(1);
        expect(candleBodyWidth(0)).toBe(1);
    });
});

describe('buildCandleGeometry', () => {
    it('заполняет ровно столько свечей, сколько видно', () => {
        const { bars, timeScale, priceScale, visible } = setup();
        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);

        expect(geometry.count).toBe(visible.to - visible.from + 1);
    });

    it('тело свечи лежит внутри тени', () => {
        const { bars, timeScale, priceScale, visible } = setup();
        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);

        for (let i = 0; i < geometry.count; i += 1) {
            expect(geometry.wickTop[i]!).toBeLessThanOrEqual(geometry.bodyTop[i]! + 1e-9);
            expect(geometry.wickBottom[i]!).toBeGreaterThanOrEqual(geometry.bodyBottom[i]! - 1e-9);
        }
    });

    it('направление свечи соответствует данным', () => {
        const { bars, timeScale, priceScale, visible } = setup();
        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);

        for (let i = 0; i < geometry.count; i += 1) {
            const index = visible.from + i;
            const up = bars.closeAt(index) >= bars.openAt(index) ? 1 : 0;
            expect(geometry.up[i]).toBe(up);
        }
    });

    it('буферы переиспользуются: повторная сборка не аллоцирует заново', () => {
        const { bars, timeScale, priceScale, visible } = setup();
        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);
        const buffer = geometry.x;

        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);
        expect(geometry.x).toBe(buffer);
    });

    it('пустой диапазон обнуляет счётчик, не роняя сборку', () => {
        const { bars, timeScale, priceScale } = setup();
        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, 5, 4, timeScale, priceScale, geometry);
        expect(geometry.count).toBe(0);
    });

    it('на плотных барах включается режим только теней', () => {
        const { bars, priceScale } = setup();
        const timeScale = new TimeScale({ barSpacing: 1, minBarSpacing: 0.5 });
        timeScale.setWidth(800);
        timeScale.setBarCount(bars.length);
        const visible = timeScale.visibleBars();

        const geometry = new CandleGeometry();
        buildCandleGeometry(bars, visible.from, visible.to, timeScale, priceScale, geometry);
        expect(geometry.wickOnly).toBe(true);
    });
});

describe('niceStep', () => {
    it('возвращает круглые шаги', () => {
        expect(niceStep(100, 10)).toBe(10);
        expect(niceStep(1, 5)).toBeCloseTo(0.2, 9);
        expect(niceStep(0.05, 5)).toBeCloseTo(0.01, 9);
    });

    it('не падает на некорректном входе', () => {
        expect(niceStep(0, 10)).toBe(1);
        expect(niceStep(100, 0)).toBe(1);
        expect(niceStep(-5, 10)).toBe(1);
    });
});
