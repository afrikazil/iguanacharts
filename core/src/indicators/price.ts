import type { Bar } from '../model/bars.js';
import { WindowIndicator } from './indicator.js';

/** Медианная цена: (H + L) / 2. Значение есть с первого бара. */
export class MedPrice extends WindowIndicator {
    readonly name = 'MEDPRICE';
    readonly outputs = ['MEDPRICE'] as const;

    constructor() {
        super(1);
    }

    protected compute(out: Float64Array): void {
        out[0] = (this.window.high() + this.window.low()) / 2;
    }
}

/** Типичная цена: (H + L + C) / 3. */
export class TypPrice extends WindowIndicator {
    readonly name = 'TYPPRICE';
    readonly outputs = ['TYPPRICE'] as const;

    constructor() {
        super(1);
    }

    protected compute(out: Float64Array): void {
        out[0] = (this.window.high() + this.window.low() + this.window.close()) / 3;
    }
}

/** Взвешенная цена закрытия: (H + L + 2C) / 4 — закрытию даётся двойной вес. */
export class WclPrice extends WindowIndicator {
    readonly name = 'WCLPRICE';
    readonly outputs = ['WCLPRICE'] as const;

    constructor() {
        super(1);
    }

    protected compute(out: Float64Array): void {
        out[0] = (this.window.high() + this.window.low() + this.window.close() * 2) / 4;
    }
}

/**
 * Истинный диапазон: наибольшее из H-L, |H - предыдущее C| и |L - предыдущее C|.
 * Требует предыдущий бар, поэтому первое значение — на баре 1.
 */
export class TrueRange extends WindowIndicator {
    readonly name = 'TRANGE';
    readonly outputs = ['TRANGE'] as const;

    constructor() {
        super(2);
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        out[0] = trueRange(
            this.window.high(),
            this.window.low(),
            this.window.close(1),
        );
    }
}

/** Общая формула — нужна ATR, ADX и DI, которые считают её сами. */
export function trueRange(high: number, low: number, previousClose: number): number {
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
}

/** Значение бара по типу цены — аналог CandleValueIdx в legacy. */
export type PriceSource = 'open' | 'high' | 'low' | 'close';

export function priceOf(bar: Bar, source: PriceSource): number {
    return bar[source];
}
