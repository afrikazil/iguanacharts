import type { Indicator } from '../indicators/indicator.js';
import type { BarSeries, MinMax } from './bars.js';

/**
 * Значения индикатора по каналам, выровненные по индексам баров.
 *
 * Канал на выход: у SMA один, у MACD три. NaN означает «значения ещё нет» —
 * так период разогрева не требует отдельного смещения, а линия просто рвётся
 * на этих участках.
 */
export class IndicatorSeries {
    private readonly channels: Float64Array[];
    private readonly scratch: Float64Array;
    private count = 0;

    constructor(readonly channelCount: number) {
        this.channels = Array.from({ length: channelCount }, () => new Float64Array(0));
        this.scratch = new Float64Array(channelCount);
    }

    get length(): number {
        return this.count;
    }

    valueAt(index: number, channel = 0): number {
        if (index < 0 || index >= this.count) return NaN;
        return this.channels[channel]?.[index] ?? NaN;
    }

    /** Полный пересчёт по всей истории. */
    recompute(bars: BarSeries, indicator: Indicator): void {
        this.ensureCapacity(bars.length);
        indicator.reset();
        for (let i = 0; i < bars.length; i += 1) {
            indicator.push(bars.barAt(i), this.scratch);
            this.writeAt(i);
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
        indicator.push(bars.barAt(index), this.scratch);
        this.writeAt(index);
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
        indicator.updateLast(bars.barAt(index), this.scratch);
        this.writeAt(index);
    }

    /** Границы значений по всем каналам, пропуская период разогрева. */
    minMaxInRange(from: number, to: number): MinMax {
        const start = Math.max(from, 0);
        const end = Math.min(to, this.count - 1);
        let min = NaN;
        let max = NaN;

        for (const channel of this.channels) {
            for (let i = start; i <= end; i += 1) {
                const value = channel[i]!;
                if (Number.isNaN(value)) continue;
                if (Number.isNaN(min) || value < min) min = value;
                if (Number.isNaN(max) || value > max) max = value;
            }
        }
        return { min, max };
    }

    private writeAt(index: number): void {
        for (let c = 0; c < this.channelCount; c += 1) {
            this.channels[c]![index] = this.scratch[c]!;
        }
    }

    private ensureCapacity(length: number): void {
        if ((this.channels[0]?.length ?? 0) >= length) return;
        const size = Math.max(length, (this.channels[0]?.length ?? 0) * 2, 1024);
        for (let c = 0; c < this.channelCount; c += 1) {
            const next = new Float64Array(size);
            next.set(this.channels[c]!.subarray(0, this.count));
            this.channels[c] = next;
        }
    }
}
