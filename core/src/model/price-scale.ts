export type PriceScaleMode = 'linear' | 'logarithmic' | 'percentage';

export interface PriceScaleOptions {
    mode: PriceScaleMode;
    /** Доля высоты, оставляемая пустой сверху и снизу при автоскейле. */
    topMargin: number;
    bottomMargin: number;
}

export const DEFAULT_PRICE_SCALE_OPTIONS: PriceScaleOptions = {
    mode: 'linear',
    topMargin: 0.1,
    bottomMargin: 0.1,
};

const LOG_FLOOR = 1e-10;

/**
 * Ось Y. Три режима приводятся к общему «внутреннему» пространству, в котором
 * отображение во пиксели всегда линейное — благодаря этому логарифмическая и
 * процентная шкалы не требуют отдельных ветвей в рендерере.
 */
export class PriceScale {
    private height = 0;
    private internalMin = 0;
    private internalMax = 1;
    private base = 1;
    private readonly options: PriceScaleOptions;

    constructor(options: Partial<PriceScaleOptions> = {}) {
        this.options = { ...DEFAULT_PRICE_SCALE_OPTIONS, ...options };
    }

    get mode(): PriceScaleMode {
        return this.options.mode;
    }

    setHeight(height: number): void {
        this.height = Math.max(height, 0);
    }

    setMode(mode: PriceScaleMode): void {
        this.options.mode = mode;
    }

    /** База для процентного режима — обычно закрытие первого видимого бара. */
    setBase(base: number): void {
        this.base = base === 0 ? 1 : base;
    }

    setPriceRange(min: number, max: number): void {
        this.internalMin = this.toInternal(min);
        this.internalMax = this.toInternal(max);
        this.guardRange();
    }

    /** Границы видимых данных плюс поля. */
    autoScale(min: number, max: number): void {
        if (!Number.isFinite(min) || !Number.isFinite(max)) return;
        let lo = this.toInternal(min);
        let hi = this.toInternal(max);
        if (hi < lo) [lo, hi] = [hi, lo];

        let span = hi - lo;
        if (span === 0) {
            // Плоский участок: раздвигаем на 1% от уровня, иначе делить на ноль.
            span = Math.abs(hi) * 0.01 || 1;
            lo -= span / 2;
            hi += span / 2;
        }
        this.internalMin = lo - span * this.options.bottomMargin;
        this.internalMax = hi + span * this.options.topMargin;
        this.guardRange();
    }

    yAt(price: number): number {
        const internal = this.toInternal(price);
        const ratio = (internal - this.internalMin) / (this.internalMax - this.internalMin);
        return this.height - ratio * this.height;
    }

    priceAt(y: number): number {
        const ratio = (this.height - y) / this.height;
        return this.fromInternal(this.internalMin + ratio * (this.internalMax - this.internalMin));
    }

    /** Границы в ценах — нужны для генерации подписей оси. */
    priceRange(): { min: number; max: number } {
        return { min: this.fromInternal(this.internalMin), max: this.fromInternal(this.internalMax) };
    }

    private toInternal(price: number): number {
        switch (this.options.mode) {
            case 'linear':
                return price;
            case 'logarithmic':
                return Math.log10(Math.max(price, LOG_FLOOR));
            case 'percentage':
                return (price / this.base - 1) * 100;
        }
    }

    private fromInternal(value: number): number {
        switch (this.options.mode) {
            case 'linear':
                return value;
            case 'logarithmic':
                return 10 ** value;
            case 'percentage':
                return (value / 100 + 1) * this.base;
        }
    }

    private guardRange(): void {
        if (this.internalMax <= this.internalMin) this.internalMax = this.internalMin + 1;
    }
}
