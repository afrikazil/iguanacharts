import { describe, expect, it } from 'vitest';
import { Sma } from '../src/indicators/sma.js';
import { BarSeries } from '../src/model/bars.js';
import { IndicatorSeries } from '../src/model/indicator-series.js';
import { PriceScale } from '../src/model/price-scale.js';
import { TimeScale } from '../src/model/time-scale.js';
import { HistogramGeometry, buildHistogramGeometry } from '../src/render/histogram.js';
import { LineGeometry, buildLineGeometry } from '../src/render/line.js';
import { VolumeSource } from '../src/series/volume-source.js';
import { randomWalk } from './helpers.js';

function setup(barCount = 200) {
    const bars = new BarSeries();
    bars.setData(randomWalk(barCount, 21));

    const timeScale = new TimeScale({ barSpacing: 10 });
    timeScale.setWidth(800);
    timeScale.setBarCount(bars.length);

    const priceScale = new PriceScale();
    priceScale.setHeight(100);

    return { bars, timeScale, priceScale };
}

describe('VolumeSource', () => {
    it('диапазон объёма всегда отсчитывается от нуля', () => {
        // Иначе столбики врут: разница в 1% выглядит как разница в разы.
        const { bars } = setup();
        const source = new VolumeSource({ upColor: '#0f0', downColor: '#f00' });
        const range = source.valueRange(bars, 0, 199);

        expect(range.min).toBe(0);
        expect(range.max).toBe(bars.volumeMaxInRange(0, 199));
    });

    it('пустой диапазон даёт NaN в максимуме', () => {
        const { bars } = setup();
        const source = new VolumeSource({ upColor: '#0f0', downColor: '#f00' });
        expect(source.valueRange(bars, 10, 5).max).toBeNaN();
    });
});

describe('buildHistogramGeometry', () => {
    it('столбики растут от низа пейна вверх', () => {
        const { bars, timeScale, priceScale } = setup();
        priceScale.autoScale(0, bars.volumeMaxInRange(0, 199));
        const geometry = new HistogramGeometry();
        buildHistogramGeometry(bars, 0, 99, timeScale, priceScale, 100, geometry);

        expect(geometry.baseline).toBe(100);
        for (let i = 0; i < geometry.count; i += 1) {
            expect(geometry.top[i]!).toBeLessThanOrEqual(geometry.baseline);
        }
    });

    it('цвет столбика повторяет направление свечи', () => {
        const { bars, timeScale, priceScale } = setup();
        const geometry = new HistogramGeometry();
        buildHistogramGeometry(bars, 0, 99, timeScale, priceScale, 100, geometry);

        for (let i = 0; i < geometry.count; i += 1) {
            expect(geometry.up[i]).toBe(bars.closeAt(i) >= bars.openAt(i) ? 1 : 0);
        }
    });

    it('ширина столбика не меньше пикселя', () => {
        const { bars, priceScale } = setup();
        const timeScale = new TimeScale({ barSpacing: 0.5, minBarSpacing: 0.5 });
        timeScale.setWidth(800);
        timeScale.setBarCount(bars.length);

        const geometry = new HistogramGeometry();
        buildHistogramGeometry(bars, 0, 99, timeScale, priceScale, 100, geometry);
        expect(geometry.barWidth).toBeGreaterThanOrEqual(1);
    });
});

describe('buildLineGeometry', () => {
    it('период разогрева даёт NaN — линия рвётся, а не тянется к нулю', () => {
        const { bars, timeScale, priceScale } = setup();
        const series = new IndicatorSeries(1);
        series.recompute(bars, new Sma(10));
        const { min, max } = series.minMaxInRange(0, 199);
        priceScale.autoScale(min, max);

        const geometry = new LineGeometry();
        buildLineGeometry(series, 0, 0, 50, timeScale, priceScale, geometry);

        expect(geometry.y[0]!).toBeNaN();
        expect(geometry.y[8]!).toBeNaN();
        expect(geometry.y[9]!).not.toBeNaN();
    });

    it('x совпадает с позицией бара на оси времени', () => {
        const { bars, timeScale, priceScale } = setup();
        const series = new IndicatorSeries(1);
        series.recompute(bars, new Sma(3));

        const geometry = new LineGeometry();
        buildLineGeometry(series, 0, 20, 40, timeScale, priceScale, geometry);

        expect(geometry.x[0]!).toBeCloseTo(timeScale.xAt(20), 4);
        expect(geometry.x[20]!).toBeCloseTo(timeScale.xAt(40), 4);
    });

    it('буферы переиспользуются между кадрами', () => {
        const { bars, timeScale, priceScale } = setup();
        const series = new IndicatorSeries(1);
        series.recompute(bars, new Sma(3));

        const geometry = new LineGeometry();
        buildLineGeometry(series, 0, 0, 99, timeScale, priceScale, geometry);
        const buffer = geometry.y;
        buildLineGeometry(series, 0, 0, 99, timeScale, priceScale, geometry);
        expect(geometry.y).toBe(buffer);
    });
});
