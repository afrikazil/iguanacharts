import type { Indicator } from '../indicators/indicator.js';
import type { BarSeries, MinMax } from './bars.js';

/**
 * Значения индикатора, выровненные по индексам баров.
 *
 * NaN означает «значения ещё нет» — так период разогрева не требует отдельного
 * смещения и рендер линии просто рвётся на этих участках.
 */
export class IndicatorSeries {
    private values: Float64Array = new Float64Array(0);
    private count = 0;

    get length(): number {
        return this.count;
    }

    valueAt(index: number): number {
        return index >= 0 && index < this.count ? this.values[index]! : NaN;
    }

    /** Полный пересчёт по всей истории. */
    recompute(bars: BarSeries, indicator: Indicator): void {
        this.ensureCapacity(bars.length);
        indicator.reset();
        for (let i = 0; i < bars.length; i += 1) {
            this.values[i] = indicator.push(bars.barAt(i)) ?? NaN;
        }
        this.count = bars.length;
    }

    /** Добавился новый бар — шагаем индикатором на один бар. */
    pushLast(bars: BarSeries, indicator: Indicator): void {
        const index = bars.length - 1;
        if (index < 0) return;
        if (index !== this.count) {
            // Пропуск или откат: дешевле пересчитать, чем угадывать состояние.
            this.recompute(bars, indicator);
            return;
        }
        this.ensureCapacity(bars.length);
        this.values[index] = indicator.push(bars.barAt(index)) ?? NaN;
        this.count = bars.length;
    }

    /** Тик по последнему бару. */
    updateLast(bars: BarSeries, indicator: Indicator): void {
        const index = bars.length - 1;
        if (index < 0) return;
        if (index !== this.count - 1) {
            this.recompute(bars, indicator);
            return;
        }
        this.values[index] = indicator.updateLast(bars.barAt(index)) ?? NaN;
    }

    /** Границы значений на диапазоне, пропуская период разогрева. */
    minMaxInRange(from: number, to: number): MinMax {
        const start = Math.max(from, 0);
        const end = Math.min(to, this.count - 1);
        let min = NaN;
        let max = NaN;

        for (let i = start; i <= end; i += 1) {
            const value = this.values[i]!;
            if (Number.isNaN(value)) continue;
            if (Number.isNaN(min) || value < min) min = value;
            if (Number.isNaN(max) || value > max) max = value;
        }
        return { min, max };
    }

    private ensureCapacity(length: number): void {
        if (this.values.length >= length) return;
        const next = new Float64Array(Math.max(length, this.values.length * 2, 1024));
        next.set(this.values.subarray(0, this.count));
        this.values = next;
    }
}
