import type { BarSeries, MinMax } from '../model/bars.js';
import { drawCandles, type CandleStyle } from '../render/candle-renderer.js';
import { CandleGeometry, buildCandleGeometry } from '../render/geometry.js';
import type { BuildContext, DataChange, SeriesSource } from './source.js';

export class CandleSource implements SeriesSource {
    readonly title = 'Свечи';

    private readonly geometry = new CandleGeometry();

    constructor(private style: CandleStyle) {}

    setStyle(style: CandleStyle): void {
        this.style = style;
    }

    valueRange(bars: BarSeries, from: number, to: number): MinMax {
        return bars.lowHighInRange(from, to);
    }

    sync(_bars: BarSeries, _change: DataChange): void {
        // Свечи читаются прямо из BarSeries — своего состояния нет.
    }

    build(context: BuildContext): void {
        buildCandleGeometry(
            context.bars,
            context.from,
            context.to,
            context.timeScale,
            context.priceScale,
            this.geometry,
        );
    }

    draw(ctx: CanvasRenderingContext2D): void {
        drawCandles(ctx, this.geometry, this.style);
    }

    legendAt(bars: BarSeries, index: number): string | null {
        if (index < 0 || index >= bars.length) return null;
        const bar = bars.barAt(index);
        return (
            `O ${bar.open.toFixed(2)}  H ${bar.high.toFixed(2)}  ` +
            `L ${bar.low.toFixed(2)}  C ${bar.close.toFixed(2)}`
        );
    }
}
