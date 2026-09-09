import { describe, expect, it } from 'vitest';
import { Rsi } from '../src/indicators/rsi.js';
import { Sma } from '../src/indicators/sma.js';
import { BarSeries } from '../src/model/bars.js';
import { IndicatorSeries } from '../src/model/indicator-series.js';
import { randomWalk } from './helpers.js';

describe('IndicatorSeries', () => {
    it('recompute выравнивает значения по индексам баров', () => {
        const bars = new BarSeries();
        bars.setData(randomWalk(100, 2));
        const series = new IndicatorSeries(1);
        series.recompute(bars, new Sma(10));

        expect(series.length).toBe(100);
        // Период разогрева — NaN, дальше значения есть.
        expect(series.valueAt(8)).toBeNaN();
        expect(series.valueAt(9)).not.toBeNaN();
    });

    it('пошаговое наполнение совпадает с полным пересчётом', () => {
        const all = randomWalk(200, 6);
        const expected = new IndicatorSeries(1);
        const expectedBars = new BarSeries();
        expectedBars.setData(all);
        expected.recompute(expectedBars, new Rsi(14));

        const bars = new BarSeries();
        const series = new IndicatorSeries(1);
        const indicator = new Rsi(14);
        indicator.reset();

        for (const bar of all) {
            bars.append(bar);
            series.pushLast(bars, indicator);
        }

        for (let i = 0; i < all.length; i += 1) {
            const a = series.valueAt(i);
            const b = expected.valueAt(i);
            if (Number.isNaN(b)) expect(a).toBeNaN();
            else expect(a).toBeCloseTo(b, 9);
        }
    });

    it('updateLast переписывает последнее значение, не сдвигая ряд', () => {
        const all = randomWalk(60, 8);
        const bars = new BarSeries();
        const series = new IndicatorSeries(1);
        const indicator = new Sma(5);
        indicator.reset();

        for (const bar of all) {
            bars.append(bar);
            series.pushLast(bars, indicator);
        }
        const before = series.valueAt(58);

        const last = { ...all[59]!, close: all[59]!.close * 1.5 };
        bars.updateLast(last);
        series.updateLast(bars, indicator);

        expect(series.length).toBe(60);
        expect(series.valueAt(58)).toBeCloseTo(before, 9);
        expect(series.valueAt(59)).toBeCloseTo(
            (all[55]!.close + all[56]!.close + all[57]!.close + all[58]!.close + last.close) / 5,
            9,
        );
    });

    it('рассинхронизация индексов приводит к полному пересчёту, а не к мусору', () => {
        // Ряд заполнен на 20 барах, затем данные подменены на 80 — pushLast
        // обнаруживает разрыв и пересчитывает всё.
        const bars = new BarSeries();
        bars.setData(randomWalk(20, 3));
        const series = new IndicatorSeries(1);
        const indicator = new Sma(5);
        series.recompute(bars, indicator);

        bars.setData(randomWalk(80, 3));
        series.pushLast(bars, indicator);

        expect(series.length).toBe(80);
        expect(series.valueAt(79)).not.toBeNaN();
    });

    it('minMaxInRange пропускает период разогрева', () => {
        const bars = new BarSeries();
        bars.setData(randomWalk(50, 12));
        const series = new IndicatorSeries(1);
        series.recompute(bars, new Sma(10));

        const range = series.minMaxInRange(0, 49);
        expect(range.min).not.toBeNaN();
        expect(range.max).toBeGreaterThanOrEqual(range.min);

        // Диапазон целиком внутри разогрева — значений нет.
        const warmup = series.minMaxInRange(0, 5);
        expect(warmup.min).toBeNaN();
        expect(warmup.max).toBeNaN();
    });
});
