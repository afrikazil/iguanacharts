import type { BarSeries } from '../model/bars.js';
import type { PriceScale } from '../model/price-scale.js';
import type { TimeScale } from '../model/time-scale.js';

/**
 * Геометрия свечей в пикселях.
 *
 * Буферы переиспользуются между кадрами и растут только вверх: на 60 кадрах в
 * секунду любая аллокация на кадр — это работа для GC в момент, когда её меньше
 * всего хотят. Отсюда же и отсутствие массива объектов: одна свеча описана
 * значениями по одному индексу в шести параллельных массивах.
 */
export class CandleGeometry {
    count = 0;
    /** Центр свечи по X. */
    x: Float32Array = new Float32Array(0);
    bodyTop: Float32Array = new Float32Array(0);
    bodyBottom: Float32Array = new Float32Array(0);
    wickTop: Float32Array = new Float32Array(0);
    wickBottom: Float32Array = new Float32Array(0);
    /** 1 — закрытие не ниже открытия. */
    up: Uint8Array = new Uint8Array(0);

    /** Ширина тела, одна для всех свечей кадра. */
    bodyWidth = 1;
    /** true, когда бары так плотно, что тело не нарисовать — рисуем только линии. */
    wickOnly = false;

    ensureCapacity(count: number): void {
        if (this.x.length >= count) return;
        const size = Math.max(count, this.x.length * 2, 1024);
        this.x = new Float32Array(size);
        this.bodyTop = new Float32Array(size);
        this.bodyBottom = new Float32Array(size);
        this.wickTop = new Float32Array(size);
        this.wickBottom = new Float32Array(size);
        this.up = new Uint8Array(size);
    }
}

/**
 * Ширина тела свечи. Всегда нечётная в пикселях: при нечётной ширине центр
 * попадает на середину пикселя, и однопиксельная тень рисуется без размытия.
 */
export function candleBodyWidth(barSpacing: number): number {
    const width = Math.floor(barSpacing * 0.8);
    if (width < 1) return 1;
    return width % 2 === 0 ? width - 1 : width;
}

export function buildCandleGeometry(
    bars: BarSeries,
    from: number,
    to: number,
    timeScale: TimeScale,
    priceScale: PriceScale,
    out: CandleGeometry,
): void {
    const count = to - from + 1;
    if (count <= 0) {
        out.count = 0;
        return;
    }

    out.ensureCapacity(count);
    out.bodyWidth = candleBodyWidth(timeScale.barSpacing);
    out.wickOnly = timeScale.barSpacing < 3;

    for (let i = 0; i < count; i += 1) {
        const index = from + i;
        const open = bars.openAt(index);
        const close = bars.closeAt(index);
        const up = close >= open ? 1 : 0;

        out.x[i] = Math.round(timeScale.xAt(index));
        out.wickTop[i] = priceScale.yAt(bars.highAt(index));
        out.wickBottom[i] = priceScale.yAt(bars.lowAt(index));
        out.bodyTop[i] = priceScale.yAt(up === 1 ? close : open);
        out.bodyBottom[i] = priceScale.yAt(up === 1 ? open : close);
        out.up[i] = up;
    }
    out.count = count;
}

/**
 * «Круглые» шаги для подписей оси: 1, 2, 2.5, 5, 10 × 10^n.
 * Возвращает шаг, а не список значений, чтобы не аллоцировать массив на кадр.
 */
export function niceStep(span: number, targetCount: number): number {
    if (!(span > 0) || targetCount <= 0) return 1;
    const rough = span / targetCount;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const normalized = rough / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
}
