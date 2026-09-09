import type { BarSeries, MinMax } from '../model/bars.js';
import type { PriceScale } from '../model/price-scale.js';
import type { TimeScale } from '../model/time-scale.js';

/** Что именно произошло с данными — источник решает, насколько дорого реагировать. */
export type DataChange = 'reset' | 'append' | 'updateLast';

export interface BuildContext {
    bars: BarSeries;
    /** Первый видимый индекс бара, включительно. */
    from: number;
    /** Последний видимый индекс бара, включительно. */
    to: number;
    timeScale: TimeScale;
    /** Шкала пейна, в котором живёт источник. */
    priceScale: PriceScale;
    paneWidth: number;
    paneHeight: number;
}

/**
 * Источник данных пейна: свечи, объём, линия индикатора.
 *
 * Контракт один для всех, поэтому добавление нового типа серии не требует
 * правок ядра — в отличие от старого рендерера, где тип графика разбирался
 * через switch внутри цикла по барам.
 *
 * Разделение build/draw не косметическое: build вызывается только когда
 * изменилась геометрия, а draw — на каждой перерисовке слоя.
 */
export interface SeriesSource {
    readonly title: string;
    /** Границы значений на видимом диапазоне для автоскейла пейна. */
    valueRange(bars: BarSeries, from: number, to: number): MinMax;
    /** Реакция на изменение данных. */
    sync(bars: BarSeries, change: DataChange): void;
    /** Пересборка геометрии под текущие шкалы. */
    build(context: BuildContext): void;
    /** Отрисовка в локальных координатах пейна. */
    draw(ctx: CanvasRenderingContext2D): void;
    /** Значение под курсором для легенды. */
    legendAt(bars: BarSeries, index: number): string | null;
}
