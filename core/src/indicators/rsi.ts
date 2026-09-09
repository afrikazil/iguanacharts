import type { Bar } from '../model/bars.js';
import { IncrementalIndicator } from './indicator.js';

interface RsiState {
    prevClose: number;
    hasPrev: boolean;
    changes: number;
    sumGain: number;
    sumLoss: number;
    avgGain: number;
    avgLoss: number;
}

/**
 * RSI со сглаживанием Уайлдера — то же, что считает TA-Lib и что показывает
 * TradingView. Первое значение появляется после period изменений цены, то есть
 * на баре с индексом period.
 */
export class Rsi extends IncrementalIndicator<RsiState> {
    readonly name: string;

    private prevClose = 0;
    private hasPrev = false;
    private changes = 0;
    private sumGain = 0;
    private sumLoss = 0;
    private avgGain = 0;
    private avgLoss = 0;

    constructor(private readonly period = 14) {
        super();
        if (!Number.isInteger(period) || period < 1) {
            throw new RangeError(`период RSI должен быть целым >= 1, получено ${period}`);
        }
        this.name = `RSI(${period})`;
    }

    protected initState(): void {
        this.prevClose = 0;
        this.hasPrev = false;
        this.changes = 0;
        this.sumGain = 0;
        this.sumLoss = 0;
        this.avgGain = 0;
        this.avgLoss = 0;
    }

    protected captureState(): RsiState {
        return {
            prevClose: this.prevClose,
            hasPrev: this.hasPrev,
            changes: this.changes,
            sumGain: this.sumGain,
            sumLoss: this.sumLoss,
            avgGain: this.avgGain,
            avgLoss: this.avgLoss,
        };
    }

    protected restoreState(state: RsiState): void {
        this.prevClose = state.prevClose;
        this.hasPrev = state.hasPrev;
        this.changes = state.changes;
        this.sumGain = state.sumGain;
        this.sumLoss = state.sumLoss;
        this.avgGain = state.avgGain;
        this.avgLoss = state.avgLoss;
    }

    protected step(bar: Bar): number | undefined {
        if (!this.hasPrev) {
            this.prevClose = bar.close;
            this.hasPrev = true;
            return undefined;
        }

        const change = bar.close - this.prevClose;
        this.prevClose = bar.close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        this.changes += 1;

        if (this.changes < this.period) {
            this.sumGain += gain;
            this.sumLoss += loss;
            return undefined;
        }

        if (this.changes === this.period) {
            this.sumGain += gain;
            this.sumLoss += loss;
            this.avgGain = this.sumGain / this.period;
            this.avgLoss = this.sumLoss / this.period;
        } else {
            this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
            this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
        }

        if (this.avgLoss === 0) return this.avgGain === 0 ? 50 : 100;
        return 100 - 100 / (1 + this.avgGain / this.avgLoss);
    }
}
