import { describe, expect, it } from 'vitest';
import { Adx, MinusDi, MinusDm, PlusDi, Sar } from '../src/indicators/directional.js';
import type { Indicator } from '../src/indicators/indicator.js';
import { Ad, Adosc, Mfi, Obv, Vpt } from '../src/indicators/volume.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const bars = randomWalk(300, 37);
const shape = toDataShape(bars);

function checkSingle(
    legacyName: string,
    settings: Record<string, number>,
    indicator: Indicator,
    skip = 0,
): string[] {
    const expected = legacy(legacyName).calculate(0, bars.length - 1, shape, settings) as number[];
    return compareWithLegacy(feedChannel(indicator, bars), expected, { skip });
}

describe('направленное движение совпадает с legacy', () => {
    it('MINUS_DM(14)', () => {
        expect(checkSingle('MINUS_DM', { TimePeriod: 14 }, new MinusDm(14))).toEqual([]);
    });

    it('MINUS_DI(14)', () => {
        expect(checkSingle('MINUS_DI', { TimePeriod: 14 }, new MinusDi(14))).toEqual([]);
    });

    it('PLUS_DI(14)', () => {
        expect(checkSingle('PLUS_DI', { TimePeriod: 14 }, new PlusDi(14))).toEqual([]);
    });

    it('ADX(14)', () => {
        // legacy добивает начало массива нулями через unshift(0), поэтому
        // сравниваем начиная с реального разогрева 2*period - 1.
        expect(checkSingle('ADX', { TimePeriod: 14 }, new Adx(14), 2 * 14 - 1)).toEqual([]);
    });

    it('ADX: legacy отдаёт нули на разогреве, мы — NaN', () => {
        const legacyValues = legacy('ADX').calculate(0, bars.length - 1, shape, {
            TimePeriod: 14,
        }) as number[];
        const mine = feedChannel(new Adx(14), bars);

        expect(legacyValues[10]).toBe(0);
        expect(mine[10]!).toBeNaN();
    });

    it('SAR', () => {
        expect(checkSingle('SAR', { Acceleration: 0.02, Maximum: 0.2 }, new Sar())).toEqual([]);
    });
});

describe('объёмные индикаторы совпадают с legacy', () => {
    it('AD', () => {
        expect(checkSingle('AD', {}, new Ad())).toEqual([]);
    });

    it('OBV', () => {
        expect(checkSingle('OBV', {}, new Obv())).toEqual([]);
    });

    it('VPT', () => {
        expect(checkSingle('VPT', {}, new Vpt())).toEqual([]);
    });

    it('MFI(14)', () => {
        expect(checkSingle('MFI', { TimePeriod: 14 }, new Mfi(14))).toEqual([]);
    });

    it('ADOSC(3,10)', () => {
        expect(
            checkSingle('ADOSC', { FastPeriod: 3, SlowPeriod: 10 }, new Adosc(3, 10)),
        ).toEqual([]);
    });
});
