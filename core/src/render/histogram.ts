import type { BarSeries } from '../model/bars.js';
import type { PriceScale } from '../model/price-scale.js';
import type { TimeScale } from '../model/time-scale.js';

export interface HistogramStyle {
    upColor: string;
    downColor: string;
}

/** Геометрия столбиков объёма. Буферы переиспользуются между кадрами. */
export class HistogramGeometry {
    count = 0;
    x: Float32Array = new Float32Array(0);
    top: Float32Array = new Float32Array(0);
    up: Uint8Array = new Uint8Array(0);

    barWidth = 1;
    /** Y основания столбиков — низ пейна. */
    baseline = 0;

    ensureCapacity(count: number): void {
        if (this.x.length >= count) return;
        const size = Math.max(count, this.x.length * 2, 1024);
        this.x = new Float32Array(size);
        this.top = new Float32Array(size);
        this.up = new Uint8Array(size);
    }
}

export function buildHistogramGeometry(
    bars: BarSeries,
    from: number,
    to: number,
    timeScale: TimeScale,
    priceScale: PriceScale,
    paneHeight: number,
    out: HistogramGeometry,
): void {
    const count = to - from + 1;
    if (count <= 0) {
        out.count = 0;
        return;
    }

    out.ensureCapacity(count);
    out.barWidth = Math.max(Math.floor(timeScale.barSpacing * 0.7), 1);
    out.baseline = paneHeight;

    for (let i = 0; i < count; i += 1) {
        const index = from + i;
        out.x[i] = Math.round(timeScale.xAt(index));
        out.top[i] = priceScale.yAt(bars.volumeAt(index));
        out.up[i] = bars.closeAt(index) >= bars.openAt(index) ? 1 : 0;
    }
    out.count = count;
}

/** Два fill-вызова на кадр — та же схема батчинга, что у свечей. */
export function drawHistogram(
    ctx: CanvasRenderingContext2D,
    geometry: HistogramGeometry,
    style: HistogramStyle,
): void {
    if (geometry.count === 0) return;
    const half = (geometry.barWidth - 1) / 2;

    for (const up of [1, 0] as const) {
        ctx.beginPath();
        for (let i = 0; i < geometry.count; i += 1) {
            if (geometry.up[i] !== up) continue;
            const top = Math.round(geometry.top[i]!);
            // Нулевой объём иначе исчезает совсем — оставляем один пиксель.
            const height = Math.max(geometry.baseline - top, 1);
            ctx.rect(geometry.x[i]! - half - 0.5, top, geometry.barWidth, height);
        }
        ctx.fillStyle = up === 1 ? style.upColor : style.downColor;
        ctx.fill();
    }
}
