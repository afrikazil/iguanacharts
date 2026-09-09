import type { BarSeries, MinMax } from '../model/bars.js';
import {
    HistogramGeometry,
    buildHistogramGeometry,
    drawHistogram,
    type HistogramStyle,
} from '../render/histogram.js';
import type { BuildContext, DataChange, SeriesSource } from './source.js';

export class VolumeSource implements SeriesSource {
    readonly title = 'Объём';

    private readonly geometry = new HistogramGeometry();

    constructor(private style: HistogramStyle) {}

    setStyle(style: HistogramStyle): void {
        this.style = style;
    }

    /** Объём всегда отсчитывается от нуля — иначе столбики врут о пропорциях. */
    valueRange(bars: BarSeries, from: number, to: number): MinMax {
        return { min: 0, max: bars.volumeMaxInRange(from, to) };
    }

    sync(_bars: BarSeries, _change: DataChange): void {
        // Объём тоже читается прямо из BarSeries.
    }

    build(context: BuildContext): void {
        buildHistogramGeometry(
            context.bars,
            context.from,
            context.to,
            context.timeScale,
            context.priceScale,
            context.paneHeight,
            this.geometry,
        );
    }

    draw(ctx: CanvasRenderingContext2D): void {
        drawHistogram(ctx, this.geometry, this.style);
    }

    legendAt(bars: BarSeries, index: number): string | null {
        if (index < 0 || index >= bars.length) return null;
        return `V ${bars.volumeAt(index).toLocaleString('ru')}`;
    }
}
