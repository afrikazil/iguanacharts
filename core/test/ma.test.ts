import { describe, expect, it } from 'vitest';
import type { Indicator } from '../src/indicators/indicator.js';
import { Ema, Tema, Trima, Wma, Zlema } from '../src/indicators/moving-averages.js';
import { MedPrice, TrueRange, TypPrice, WclPrice } from '../src/indicators/price.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const bars = randomWalk(300, 23);
const shape = toDataShape(bars);

/** Сверка канала 0 нового индикатора с одномерным выходом legacy. */
function check(
    legacyName: string,
    settings: Record<string, number>,
    indicator: Indicator,
    digits = 8,
): string[] {
    const expected = legacy(legacyName).calculate(0, bars.length - 1, shape, settings) as number[];
    return compareWithLegacy(feedChannel(indicator, bars), expected, { digits });
}

describe('преобразования цены совпадают с legacy', () => {
    it('MEDPRICE', () => {
        expect(check('MEDPRICE', {}, new MedPrice())).toEqual([]);
    });

    it('TYPPRICE', () => {
        expect(check('TYPPRICE', {}, new TypPrice())).toEqual([]);
    });

    it('WCLPRICE', () => {
        expect(check('WCLPRICE', {}, new WclPrice())).toEqual([]);
    });

    it('TRANGE', () => {
        expect(check('TRANGE', {}, new TrueRange())).toEqual([]);
    });
});

describe('скользящие средние совпадают с legacy', () => {
    it('EMA(30)', () => {
        expect(check('EMA', { TimePeriod: 30 }, new Ema(30))).toEqual([]);
    });

    it('EMA(9) — короткий период', () => {
        expect(check('EMA', { TimePeriod: 9 }, new Ema(9))).toEqual([]);
    });

    it('WMA(30)', () => {
        expect(check('WMA', { TimePeriod: 30 }, new Wma(30))).toEqual([]);
    });

    it('TRIMA(20) — чётный период', () => {
        expect(check('TRIMA', { TimePeriod: 20 }, new Trima(20))).toEqual([]);
    });

    it('TRIMA(15) — нечётный период', () => {
        expect(check('TRIMA', { TimePeriod: 15 }, new Trima(15))).toEqual([]);
    });

    it('TEMA(12)', () => {
        expect(check('TEMA', { TimePeriod: 12 }, new Tema(12))).toEqual([]);
    });

    it('ZLEMA(12)', () => {
        expect(check('ZLEMA', { TimePeriod: 12 }, new Zlema(12))).toEqual([]);
    });

    it('ZLEMA(7) — нечётный период меняет lag', () => {
        expect(check('ZLEMA', { TimePeriod: 7 }, new Zlema(7))).toEqual([]);
    });
});
