import { describe, expect, it } from 'vitest';
import { BarWindow } from '../src/indicators/indicator.js';
import { Rsi } from '../src/indicators/rsi.js';
import { Sma } from '../src/indicators/sma.js';
import type { Bar } from '../src/model/bars.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const NAN = Number.NaN;

function naiveSma(bars: readonly Bar[], period: number): number[] {
    return bars.map((_, i) => {
        if (i + 1 < period) return NAN;
        let sum = 0;
        for (let k = i + 1 - period; k <= i; k += 1) sum += bars[k]!.close;
        return sum / period;
    });
}

describe('BarWindow', () => {
    const bar = (close: number): Bar => ({
        time: close,
        open: close,
        high: close,
        low: close,
        close,
        volume: close,
    });

    it('индексация идёт от текущего бара назад', () => {
        const window = new BarWindow(3);
        window.push(bar(1));
        window.push(bar(2));
        window.push(bar(3));

        expect(window.close(0)).toBe(3);
        expect(window.close(1)).toBe(2);
        expect(window.close(2)).toBe(1);
    });

    it('вытесняет старые бары по кольцу', () => {
        const window = new BarWindow(3);
        for (let i = 1; i <= 5; i += 1) window.push(bar(i));

        expect(window.close(0)).toBe(5);
        expect(window.close(2)).toBe(3);
        expect(window.length).toBe(3);
        expect(window.seen).toBe(5);
    });

    it('full наступает ровно на size-м баре', () => {
        const window = new BarWindow(3);
        window.push(bar(1));
        expect(window.full).toBe(false);
        window.push(bar(2));
        expect(window.full).toBe(false);
        window.push(bar(3));
        expect(window.full).toBe(true);
    });

    it('replaceLast переписывает текущий бар, не сдвигая окно', () => {
        const window = new BarWindow(3);
        window.push(bar(1));
        window.push(bar(2));
        window.replaceLast(bar(99));

        expect(window.close(0)).toBe(99);
        expect(window.close(1)).toBe(1);
        expect(window.seen).toBe(2);
    });

    it('replaceLast до первого push равносилен push', () => {
        const window = new BarWindow(3);
        window.replaceLast(bar(7));
        expect(window.close(0)).toBe(7);
        expect(window.seen).toBe(1);
    });

    it('clear возвращает окно в исходное состояние', () => {
        const window = new BarWindow(3);
        window.push(bar(1));
        window.clear();
        expect(window.seen).toBe(0);
        expect(window.full).toBe(false);
    });

    it('отвергает некорректный размер', () => {
        expect(() => new BarWindow(0)).toThrow(RangeError);
        expect(() => new BarWindow(2.5)).toThrow(RangeError);
    });
});

describe('Sma', () => {
    it('совпадает с наивным проходом', () => {
        const bars = randomWalk(400, 11);
        const actual = feedChannel(new Sma(20), bars);
        const expected = naiveSma(bars, 20);

        for (let i = 0; i < bars.length; i += 1) {
            if (Number.isNaN(expected[i]!)) expect(actual[i]!).toBeNaN();
            else expect(actual[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('совпадает с legacy TA.SMA', () => {
        const bars = randomWalk(300, 17);
        const shape = toDataShape(bars);
        const expected = legacy('SMA').calculate(0, bars.length - 1, shape, {
            TimePeriod: 20,
        }) as number[];

        expect(compareWithLegacy(feedChannel(new Sma(20), bars), expected)).toEqual([]);
    });

    it('период 1 отдаёт само закрытие', () => {
        const bars = randomWalk(10);
        expect(feedChannel(new Sma(1), bars)).toEqual(bars.map((b) => b.close));
    });

    it('отвергает некорректный период', () => {
        expect(() => new Sma(0)).toThrow(RangeError);
        expect(() => new Sma(2.5)).toThrow(RangeError);
    });
});

describe('Rsi', () => {
    it('совпадает с legacy TA.RSI', () => {
        const bars = randomWalk(500, 3);
        const shape = toDataShape(bars);
        const expected = legacy('RSI').calculate(0, bars.length - 1, shape, {
            TimePeriod: 14,
        }) as number[];

        expect(compareWithLegacy(feedChannel(new Rsi(14), bars), expected)).toEqual([]);
    });

    it('первое значение появляется на баре с индексом period', () => {
        const values = feedChannel(new Rsi(14), randomWalk(30));
        expect(values[13]!).toBeNaN();
        expect(values[14]!).not.toBeNaN();
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
        expect(feedChannel(new Rsi(14), bars).at(-1)!).toBeCloseTo(100, 9);
    });
});

describe('updateLast', () => {
    /** Прогон, где каждый бар сначала приходит сырым, потом уточняется тиками. */
    function streamWithTicks(
        make: () => Sma | Rsi,
        bars: readonly Bar[],
    ): number[] {
        const indicator = make();
        const out = new Float64Array(indicator.outputs.length);
        indicator.reset();
        const streamed: number[] = [];

        for (const bar of bars) {
            indicator.push({ ...bar, close: bar.open }, out);
            for (const factor of [0.98, 1.03, 0.995]) {
                indicator.updateLast({ ...bar, close: bar.close * factor }, out);
            }
            indicator.updateLast(bar, out);
            streamed.push(out[0]!);
        }
        return streamed;
    }

    it('SMA: тики по последнему бару не искажают состояние', () => {
        const bars = randomWalk(200, 5);
        const streamed = streamWithTicks(() => new Sma(20), bars);
        const expected = naiveSma(bars, 20);

        for (let i = 0; i < bars.length; i += 1) {
            if (Number.isNaN(expected[i]!)) expect(streamed[i]!).toBeNaN();
            else expect(streamed[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('RSI: тики по последнему бару не искажают состояние', () => {
        const bars = randomWalk(200, 9);
        const streamed = streamWithTicks(() => new Rsi(14), bars);
        const expected = feedChannel(new Rsi(14), bars);

        for (let i = 0; i < bars.length; i += 1) {
            if (Number.isNaN(expected[i]!)) expect(streamed[i]!).toBeNaN();
            else expect(streamed[i]!).toBeCloseTo(expected[i]!, 9);
        }
    });

    it('updateLast без предшествующего push ведёт себя как push', () => {
        const bars = randomWalk(5);
        const indicator = new Sma(1);
        indicator.reset();
        const out = new Float64Array(1);
        indicator.updateLast(bars[0]!, out);
        expect(out[0]!).toBeCloseTo(bars[0]!.close, 9);
    });
});
