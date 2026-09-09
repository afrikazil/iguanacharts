import type { Bar } from '../model/bars.js';
import { IncrementalIndicator } from './indicator.js';

interface SmaState {
    sum: number;
    filled: number;
    writeIndex: number;
    /** Значение, которое шаг затрёт в кольцевом буфере. */
    evicted: number;
}

/** Простое скользящее среднее по закрытию. Кольцевой буфер, шаг O(1). */
export class Sma extends IncrementalIndicator<SmaState> {
    readonly name: string;

    private readonly ring: Float64Array;
    private sum = 0;
    private filled = 0;
    private writeIndex = 0;

    constructor(private readonly period: number) {
        super();
        if (!Number.isInteger(period) || period < 1) {
            throw new RangeError(`период SMA должен быть целым >= 1, получено ${period}`);
        }
        this.name = `SMA(${period})`;
        this.ring = new Float64Array(period);
    }

    protected initState(): void {
        this.ring.fill(0);
        this.sum = 0;
        this.filled = 0;
        this.writeIndex = 0;
    }

    protected captureState(): SmaState {
        return {
            sum: this.sum,
            filled: this.filled,
            writeIndex: this.writeIndex,
            evicted: this.ring[this.writeIndex]!,
        };
    }

    protected restoreState(state: SmaState): void {
        this.ring[state.writeIndex] = state.evicted;
        this.sum = state.sum;
        this.filled = state.filled;
        this.writeIndex = state.writeIndex;
    }

    protected step(bar: Bar): number | undefined {
        const index = this.writeIndex;
        if (this.filled === this.period) this.sum -= this.ring[index]!;
        this.ring[index] = bar.close;
        this.sum += bar.close;
        this.writeIndex = (index + 1) % this.period;
        if (this.filled < this.period) this.filled += 1;
        return this.filled === this.period ? this.sum / this.period : undefined;
    }
}
