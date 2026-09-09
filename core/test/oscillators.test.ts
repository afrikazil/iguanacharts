import { describe, expect, it } from 'vitest';
import type { Indicator } from '../src/indicators/indicator.js';
import { Aroon, Cci, Macd, Stoch, WilliamsR } from '../src/indicators/oscillators.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const bars = randomWalk(300, 31);
const shape = toDataShape(bars);

function checkSingle(
    legacyName: string,
    settings: Record<string, number>,
    indicator: Indicator,
): string[] {
    const expected = legacy(legacyName).calculate(0, bars.length - 1, shape, settings) as number[];
    return compareWithLegacy(feedChannel(indicator, bars), expected);
}

function checkChannel(
    legacyName: string,
    settings: Record<string, number>,
    indicator: Indicator,
    legacyKey: string,
    channel: number,
): string[] {
    const result = legacy(legacyName).calculate(0, bars.length - 1, shape, settings) as Record<
        string,
        number[]
    >;
    const expected = result[legacyKey];
    if (expected === undefined) return [`в выходе legacy нет канала ${legacyKey}`];
    return compareWithLegacy(feedChannel(indicator, bars, channel), expected);
}

describe('осцилляторы совпадают с legacy', () => {
    it('CCI(14)', () => {
        expect(checkSingle('CCI', { TimePeriod: 14 }, new Cci(14))).toEqual([]);
    });

    it('CCI(20)', () => {
        expect(checkSingle('CCI', { TimePeriod: 20 }, new Cci(20))).toEqual([]);
    });

    it('WILLR(14)', () => {
        expect(checkSingle('WILLR', { TimePeriod: 14 }, new WilliamsR(14))).toEqual([]);
    });

    it('AROON вниз', () => {
        expect(checkChannel('AROON', { TimePeriod: 14 }, new Aroon(14), 'AroonDown', 0)).toEqual(
            [],
        );
    });

    it('AROON вверх', () => {
        expect(checkChannel('AROON', { TimePeriod: 14 }, new Aroon(14), 'AroonUp', 1)).toEqual([]);
    });

    it('STOCH slowK', () => {
        const settings = { PeriodFastK: 5, PeriodSlowK: 3, PeriodSlowD: 3 };
        expect(checkChannel('STOCH', settings, new Stoch(), 'slowK', 0)).toEqual([]);
    });

    it('STOCH slowD', () => {
        const settings = { PeriodFastK: 5, PeriodSlowK: 3, PeriodSlowD: 3 };
        expect(checkChannel('STOCH', settings, new Stoch(), 'slowD', 1)).toEqual([]);
    });

    it('MACD линия', () => {
        expect(checkChannel('MACD', {}, new Macd(), 'MACD', 0)).toEqual([]);
    });

    it('MACD сигнал', () => {
        expect(checkChannel('MACD', {}, new Macd(), 'MACDSignal', 1)).toEqual([]);
    });

    it('MACD гистограмма', () => {
        expect(checkChannel('MACD', {}, new Macd(), 'MACDHist', 2)).toEqual([]);
    });
});
