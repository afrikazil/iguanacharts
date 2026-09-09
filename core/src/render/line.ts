import type { IndicatorSeries } from '../model/indicator-series.js';
import type { PriceScale } from '../model/price-scale.js';
import type { TimeScale } from '../model/time-scale.js';

export interface LineStyle {
    color: string;
    width: number;
}

/** Геометрия линии. NaN в y — разрыв: период разогрева или пропуск данных. */
export class LineGeometry {
    count = 0;
    x: Float32Array = new Float32Array(0);
    y: Float32Array = new Float32Array(0);

    ensureCapacity(count: number): void {
        if (this.x.length >= count) return;
        const size = Math.max(count, this.x.length * 2, 1024);
        this.x = new Float32Array(size);
        this.y = new Float32Array(size);
    }
}

export function buildLineGeometry(
    series: IndicatorSeries,
    from: number,
    to: number,
    timeScale: TimeScale,
    priceScale: PriceScale,
    out: LineGeometry,
): void {
    const count = to - from + 1;
    if (count <= 0) {
        out.count = 0;
        return;
    }

    out.ensureCapacity(count);
    for (let i = 0; i < count; i += 1) {
        const index = from + i;
        const value = series.valueAt(index);
        out.x[i] = timeScale.xAt(index);
        out.y[i] = Number.isNaN(value) ? NaN : priceScale.yAt(value);
    }
    out.count = count;
}

/** Один stroke на всю линию; разрывы обходятся через moveTo. */
export function drawLine(
    ctx: CanvasRenderingContext2D,
    geometry: LineGeometry,
    style: LineStyle,
): void {
    if (geometry.count === 0) return;

    ctx.beginPath();
    let penDown = false;
    for (let i = 0; i < geometry.count; i += 1) {
        const y = geometry.y[i]!;
        if (Number.isNaN(y)) {
            penDown = false;
            continue;
        }
        const x = geometry.x[i]!;
        if (penDown) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        penDown = true;
    }
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.stroke();
}
