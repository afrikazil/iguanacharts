import { WindowIndicator, requirePositiveInt } from './indicator.js';

/** Простое скользящее среднее по закрытию. */
export class Sma extends WindowIndicator {
    readonly name: string;
    readonly outputs = ['SMA'] as const;

    constructor(private readonly period: number) {
        super(requirePositiveInt(period, 'период SMA'));
        this.name = `SMA(${period})`;
    }

    protected compute(out: Float64Array): void {
        if (!this.window.full) {
            this.fillUnready(out);
            return;
        }
        let sum = 0;
        for (let k = 0; k < this.period; k += 1) sum += this.window.close(k);
        out[0] = sum / this.period;
    }
}
