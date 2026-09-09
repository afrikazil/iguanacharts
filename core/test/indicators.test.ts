import { describe, expect, it } from 'vitest';
import { Rsi } from '../src/indicators/rsi.js';
import { Sma } from '../src/indicators/sma.js';
import type { Bar } from '../src/model/bars.js';
import { randomWalk } from './helpers.js';

/** Эталон: SMA прямым проходом по окну. */
function naiveSma(bars: readonly Bar[], period: number): (number | undefined)[] {
    return bars.map((_, i) => {
        if (i + 1 < period) return undefined;
        let sum = 0;
        for (let k = i + 1 - period; k <= i; k += 1) sum += bars[k]!.close;
        return sum / period;
    });
}

/** Эталон: RSI по Уайлдеру, посчитанный с нуля. */
function naiveRsi(bars: readonly Bar[], period: number): (number | undefined)[] {
    const out: (number | undefined)[] = [undefined];
    let sumGain = 0;
    let sumLoss = 0;
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i < bars.length; i += 1) {
        const change = bars[i]!.close - bars[i - 1]!.close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        if (i < period) {
            sumGain += gain;
            sumLoss += loss;
            out.push(undefined);
            continue;
        }
        if (i === period) {
            sumGain += gain;
            sumLoss += loss;
            avgGain = sumGain / period;
            avgLoss = sumLoss / period;
        } else {
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }
        out.push(avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return out;
}

const feed = (indicator: Sma | Rsi, bars: readonly Bar[]): (number | undefined)[] =>
    bars.map((bar) => indicator.push(bar));

describe('Sma', () => {
    it('инкрементальный проход совпадает с наивным', () => {
        const bars = randomWalk(400, 11);
        const sma = new Sma(20);
        sma.reset();

        const actual = feed(sma, bars);
        const expected = naiveSma(bars, 20);
        for (let i = 0; i < bars.length; i += 1) {
            if (expected[i] === undefined) expect(actual[i]).toBeUndefined();
            else expect(actual[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('период 1 отдаёт само закрытие', () => {
        const bars = randomWalk(10);
        const sma = new Sma(1);
        sma.reset();
        expect(feed(sma, bars)).toEqual(bars.map((b) => b.close));
    });

    it('отвергает некорректный период', () => {
        expect(() => new Sma(0)).toThrow(RangeError);
        expect(() => new Sma(2.5)).toThrow(RangeError);
    });
});

describe('Rsi', () => {
    it('инкрементальный проход совпадает с наивным', () => {
        const bars = randomWalk(500, 3);
        const rsi = new Rsi(14);
        rsi.reset();

        const actual = feed(rsi, bars);
        const expected = naiveRsi(bars, 14);
        for (let i = 0; i < bars.length; i += 1) {
            if (expected[i] === undefined) expect(actual[i]).toBeUndefined();
            else expect(actual[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('первое значение появляется на баре с индексом period', () => {
        const bars = randomWalk(30);
        const rsi = new Rsi(14);
        rsi.reset();
        const values = feed(rsi, bars);
        expect(values[13]).toBeUndefined();
        expect(values[14]).toBeDefined();
    });

    it('монотонный рост даёт 100', () => {
        const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({
            time: i,
            open: 100 + i,
            high: 100 + i,
            low: 100 + i,
            close: 100 + i,
            volume: 0,
        }));
        const rsi = new Rsi(14);
        rsi.reset();
        expect(feed(rsi, bars).at(-1)).toBeCloseTo(100, 9);
    });
});

describe('updateLast', () => {
    it('SMA: тики по последнему бару не искажают состояние', () => {
        const bars = randomWalk(200, 5);
        const period = 20;

        const streaming = new Sma(period);
        streaming.reset();
        const streamed: (number | undefined)[] = [];

        for (const bar of bars) {
            // Бар приходит «сырым», затем несколько раз уточняется тиками.
            let value = streaming.push({ ...bar, close: bar.open });
            for (const factor of [0.98, 1.03, 0.995]) {
                value = streaming.updateLast({ ...bar, close: bar.close * factor });
            }
            value = streaming.updateLast(bar);
            streamed.push(value);
        }

        const expected = naiveSma(bars, period);
        for (let i = 0; i < bars.length; i += 1) {
            if (expected[i] === undefined) expect(streamed[i]).toBeUndefined();
            else expect(streamed[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('RSI: тики по последнему бару не искажают состояние', () => {
        const bars = randomWalk(200, 9);

        const streaming = new Rsi(14);
        streaming.reset();
        const streamed: (number | undefined)[] = [];

        for (const bar of bars) {
            let value = streaming.push({ ...bar, close: bar.open });
            for (const factor of [1.05, 0.97, 1.01]) {
                value = streaming.updateLast({ ...bar, close: bar.close * factor });
            }
            value = streaming.updateLast(bar);
            streamed.push(value);
        }

        const expected = naiveRsi(bars, 14);
        for (let i = 0; i < bars.length; i += 1) {
            if (expected[i] === undefined) expect(streamed[i]).toBeUndefined();
            else expect(streamed[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('updateLast без предшествующего push ведёт себя как push', () => {
        const bars = randomWalk(5);
        const a = new Sma(1);
        a.reset();
        expect(a.updateLast(bars[0]!)).toBeCloseTo(bars[0]!.close, 9);
    });
});
