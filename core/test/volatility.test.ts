import { describe, expect, it } from 'vitest';
import type { Indicator } from '../src/indicators/indicator.js';
import {
    Atr,
    Bbands,
    Chv,
    Dpo,
    Envelopes,
    PriceChannel,
    Roc,
    StdDev,
    Variance,
} from '../src/indicators/volatility.js';
import { compareWithLegacy, feedChannel, legacy, toDataShape } from './legacy-ta.js';
import { randomWalk } from './helpers.js';

const bars = randomWalk(300, 29);
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

describe('волатильность совпадает с legacy', () => {
    // Сверяемся с TA.INT_VAR, а не с публичным TA.VAR: последний делит суммы
    // на CandleValueIdx (то есть на 7 — индекс поля CLOSE) вместо TimePeriod и
    // выдаёт отрицательную «дисперсию». Внутренняя версия исправна, и именно
    // её использует STDDEV, поэтому эталоном берём её.
    it('VAR(2) совпадает с исправным INT_VAR', () => {
        expect(checkSingle('INT_VAR', { TimePeriod: 2 }, new Variance(2))).toEqual([]);
    });

    it('VAR(20) совпадает с исправным INT_VAR', () => {
        expect(checkSingle('INT_VAR', { TimePeriod: 20 }, new Variance(20))).toEqual([]);
    });

    it('публичный TA.VAR действительно сломан — фиксируем расхождение осознанно', () => {
        const broken = legacy('VAR').calculate(0, bars.length - 1, shape, {
            TimePeriod: 20,
        }) as number[];
        // Дисперсия не может быть отрицательной; legacy это выдаёт.
        expect(broken.some((value) => value < 0)).toBe(true);
        expect(feedChannel(new Variance(20), bars).slice(19).every((value) => value >= 0)).toBe(
            true,
        );
    });

    it('STDDEV(10)', () => {
        expect(checkSingle('STDDEV', { TimePeriod: 10, Deviations: 1 }, new StdDev(10, 1))).toEqual(
            [],
        );
    });

    it('STDDEV с числом отклонений даёт корень, умноженный на него', () => {
        // legacy при Deviations != 1 возвращает сырую дисперсию: цикл написан
        // как `for (i = 0; i < outNBElement; i++)`, а outNBElement объявлена и
        // никогда не присвоена, поэтому тело не исполняется. Повторять эту
        // ошибку незачем — считаем ожидание от исправной дисперсии.
        const variance = legacy('INT_VAR').calculate(0, bars.length - 1, shape, {
            TimePeriod: 10,
        }) as number[];
        const expected = variance.map((value) => Math.sqrt(value) * 2);

        expect(compareWithLegacy(feedChannel(new StdDev(10, 2), bars), expected)).toEqual([]);

        const legacyBroken = legacy('STDDEV').calculate(0, bars.length - 1, shape, {
            TimePeriod: 10,
            Deviations: 2,
        }) as number[];
        expect(legacyBroken[0]!).toBeCloseTo(variance[0]!, 12);
    });

    it('ATR(14)', () => {
        expect(checkSingle('ATR', { TimePeriod: 14 }, new Atr(14))).toEqual([]);
    });

    it('ATR(5)', () => {
        expect(checkSingle('ATR', { TimePeriod: 5 }, new Atr(5))).toEqual([]);
    });

    it('CHV(10,10)', () => {
        expect(
            checkSingle('CHV', { TimePeriod: 10, TimePeriodRoc: 10 }, new Chv(10, 10)),
        ).toEqual([]);
    });

    it('ROC(10)', () => {
        expect(checkSingle('ROC', { TimePeriod: 10 }, new Roc(10))).toEqual([]);
    });

    it('DPO(20)', () => {
        expect(checkSingle('DPO', { TimePeriod: 20 }, new Dpo(20))).toEqual([]);
    });
});

describe('полосы и каналы совпадают с legacy', () => {
    const bbSettings = { TimePeriod: 7, DeviationsUp: 2, DeviationsDown: 2, MAType: 0 };

    it('BBANDS верхняя полоса', () => {
        expect(
            checkChannel('BBANDS', bbSettings, new Bbands({ period: 7 }), 'UpperBand', 0),
        ).toEqual([]);
    });

    it('BBANDS нижняя полоса', () => {
        expect(
            checkChannel('BBANDS', bbSettings, new Bbands({ period: 7 }), 'LowerBand', 1),
        ).toEqual([]);
    });

    it('BBANDS средняя линия', () => {
        expect(
            checkChannel('BBANDS', bbSettings, new Bbands({ period: 7 }), 'MiddleBand', 2),
        ).toEqual([]);
    });

    it('ENV нижняя граница', () => {
        expect(
            checkChannel('ENV', { TimePeriod: 20, shift: 1 }, new Envelopes(20, 1), 'Lower', 0),
        ).toEqual([]);
    });

    it('ENV верхняя граница', () => {
        expect(
            checkChannel('ENV', { TimePeriod: 20, shift: 1 }, new Envelopes(20, 1), 'Upper', 1),
        ).toEqual([]);
    });

    it('PCH верхняя граница', () => {
        expect(
            checkChannel(
                'PCH',
                { TimePeriodLower: 13, TimePeriodUpper: 13 },
                new PriceChannel(13, 13),
                'high',
                0,
            ),
        ).toEqual([]);
    });

    it('PCH нижняя граница', () => {
        expect(
            checkChannel(
                'PCH',
                { TimePeriodLower: 13, TimePeriodUpper: 13 },
                new PriceChannel(13, 13),
                'low',
                1,
            ),
        ).toEqual([]);
    });
});
