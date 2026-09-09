export interface TimeScaleOptions {
    /** Пикселей на бар. */
    barSpacing: number;
    minBarSpacing: number;
    maxBarSpacing: number;
    /** Сколько баров пустого места оставлять справа. */
    rightOffset: number;
}

export interface VisibleRange {
    /** Первый видимый индекс бара, включительно. */
    from: number;
    /** Последний видимый индекс бара, включительно. */
    to: number;
}

export const DEFAULT_TIME_SCALE_OPTIONS: TimeScaleOptions = {
    barSpacing: 8,
    minBarSpacing: 0.5,
    maxBarSpacing: 120,
    rightOffset: 0,
};

const clamp = (value: number, min: number, max: number): number =>
    value < min ? min : value > max ? max : value;

/**
 * Ось X живёт в пространстве индексов баров, а не времени.
 *
 * Это ключевое решение: выходные, праздники и ночные разрывы исчезают сами
 * собой — между баром N и N+1 всегда ровно barSpacing пикселей, независимо от
 * того, сколько между ними реального времени. Так делает TradingView; попытка
 * держать линейное время требует отдельной машинерии сжатия нерабочих
 * интервалов, и именно она обычно и разъезжается с расписанием бирж.
 */
export class TimeScale {
    private width = 0;
    private barCount = 0;
    private spacing: number;
    private offsetBars: number;
    private readonly options: TimeScaleOptions;

    constructor(options: Partial<TimeScaleOptions> = {}) {
        this.options = { ...DEFAULT_TIME_SCALE_OPTIONS, ...options };
        this.spacing = this.options.barSpacing;
        this.offsetBars = this.options.rightOffset;
    }

    get barSpacing(): number {
        return this.spacing;
    }

    get rightOffset(): number {
        return this.offsetBars;
    }

    setWidth(width: number): void {
        this.width = Math.max(width, 0);
        this.clampOffset();
    }

    setBarCount(count: number): void {
        this.barCount = Math.max(count, 0);
        this.clampOffset();
    }

    setBarSpacing(spacing: number): void {
        this.spacing = clamp(spacing, this.options.minBarSpacing, this.options.maxBarSpacing);
        this.clampOffset();
    }

    setRightOffset(offset: number): void {
        this.offsetBars = offset;
        this.clampOffset();
    }

    /** Логическая координата (дробный индекс бара) у правого края вьюпорта. */
    rightEdgeLogical(): number {
        return this.barCount - 1 + this.offsetBars;
    }

    xAt(logical: number): number {
        return this.width - (this.rightEdgeLogical() - logical) * this.spacing;
    }

    logicalAt(x: number): number {
        return this.rightEdgeLogical() - (this.width - x) / this.spacing;
    }

    /** Целые индексы баров, попадающие во вьюпорт, обрезанные по данным. */
    visibleBars(): VisibleRange {
        if (this.barCount === 0) return { from: 0, to: -1 };
        const from = Math.max(Math.floor(this.logicalAt(0)), 0);
        const to = Math.min(Math.ceil(this.logicalAt(this.width)), this.barCount - 1);
        return { from, to: Math.max(to, from - 1) };
    }

    /** Протащить полотно на dx пикселей (dx > 0 — содержимое уезжает вправо). */
    scrollBy(dxPixels: number): void {
        this.offsetBars -= dxPixels / this.spacing;
        this.clampOffset();
    }

    /**
     * Зум с якорем: бар под точкой anchorX остаётся под ней же.
     * factor > 1 — приближение.
     */
    zoomAt(anchorX: number, factor: number): void {
        const anchorLogical = this.logicalAt(anchorX);
        const previous = this.spacing;
        this.spacing = clamp(
            this.spacing * factor,
            this.options.minBarSpacing,
            this.options.maxBarSpacing,
        );
        if (this.spacing === previous) return;

        const rightEdge = anchorLogical + (this.width - anchorX) / this.spacing;
        this.offsetBars = rightEdge - (this.barCount - 1);
        this.clampOffset();
    }

    /** Уложить все бары во вьюпорт с полубаровыми полями по краям. */
    fitContent(): void {
        if (this.barCount === 0 || this.width === 0) return;
        this.spacing = clamp(
            this.width / this.barCount,
            this.options.minBarSpacing,
            this.options.maxBarSpacing,
        );
        this.offsetBars = 0.5;
        this.clampOffset();
    }

    /**
     * Скролл ограничен так, чтобы на экране всегда оставались данные: справа
     * можно отъехать максимум на три четверти вьюпорта пустого места, слева —
     * до первого бара у правого края.
     */
    private clampOffset(): void {
        if (this.barCount === 0 || this.width === 0 || this.spacing === 0) return;
        const visibleBarCount = this.width / this.spacing;
        const maxOffset = visibleBarCount * 0.75;
        const minOffset = -(this.barCount - 1);
        this.offsetBars = clamp(this.offsetBars, minOffset, maxOffset);
    }
}
