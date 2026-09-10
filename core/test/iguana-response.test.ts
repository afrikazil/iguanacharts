import { describe, expect, it } from 'vitest';
import {
    barFromHlocRow,
    readIguanaResponse,
    tickersOf,
    type IguanaChartResponse,
} from '../src/data/iguana-response.js';

/** Ответ в формате API: hloc — это high, low, open, close. */
function response(overrides: Partial<IguanaChartResponse> = {}): IguanaChartResponse {
    return {
        hloc: {
            'AAPL.US': [
                [11, 9, 10, 10.5],
                [12, 10, 10.5, 11.8],
            ],
        },
        vl: { 'AAPL.US': [1000, 2000] },
        xSeries: { 'AAPL.US': [1_700_000_000, 1_700_000_060] },
        ...overrides,
    };
}

describe('readIguanaResponse', () => {
    it('порядок в hloc — high, low, open, close, а не OHLC', () => {
        // Тест существует именно ради этого: при перепутанном порядке график
        // продолжает рисоваться, просто свечи выворачиваются наизнанку.
        const { bars } = readIguanaResponse(response());
        expect(bars[0]).toEqual({
            time: 1_700_000_000_000,
            high: 11,
            low: 9,
            open: 10,
            close: 10.5,
            volume: 1000,
        });
    });

    it('время переводится из секунд в миллисекунды и не сдвигается', () => {
        const { bars } = readIguanaResponse(response());
        expect(bars[0]!.time).toBe(1_700_000_000 * 1000);
        expect(bars[1]!.time - bars[0]!.time).toBe(60_000);
    });

    it('строковые значения приводятся к числам', () => {
        const { bars } = readIguanaResponse(
            response({
                hloc: { 'AAPL.US': [['11.5', '9.5', '10', '11']] },
                vl: { 'AAPL.US': ['1500'] },
                xSeries: { 'AAPL.US': ['1700000000'] },
            }),
        );
        expect(bars[0]).toEqual({
            time: 1_700_000_000_000,
            high: 11.5,
            low: 9.5,
            open: 10,
            close: 11,
            volume: 1500,
        });
    });

    it('отсутствующий объём даёт ноль, а не NaN', () => {
        const { bars } = readIguanaResponse(response({ vl: {} }));
        expect(bars[0]!.volume).toBe(0);
        expect(bars.every((bar) => Number.isFinite(bar.volume))).toBe(true);
    });

    it('бары с незаполненными ценами отбрасываются и считаются', () => {
        // При сравнении нескольких бумаг API присылает [null,null,null,null].
        const { bars, skipped } = readIguanaResponse(
            response({
                hloc: {
                    'AAPL.US': [
                        [11, 9, 10, 10.5],
                        [null, null, null, null] as unknown as number[],
                        [12, 10, 11, 11.5],
                    ],
                },
                vl: { 'AAPL.US': [1, 2, 3] },
                xSeries: { 'AAPL.US': [1, 2, 3] },
            }),
        );
        expect(bars.length).toBe(2);
        expect(skipped).toBe(1);
    });

    it('расхождение длин полей не приводит к чтению за границей', () => {
        const { bars } = readIguanaResponse(
            response({
                hloc: {
                    'AAPL.US': [
                        [11, 9, 10, 10.5],
                        [12, 10, 11, 11.5],
                        [13, 11, 12, 12.5],
                    ],
                },
                xSeries: { 'AAPL.US': [1, 2] },
                vl: { 'AAPL.US': [1] },
            }),
        );
        expect(bars.length).toBe(2);
        expect(bars.every((bar) => Number.isFinite(bar.time))).toBe(true);
    });

    it('неупорядоченные бары сортируются, факт фиксируется', () => {
        const { bars, outOfOrder } = readIguanaResponse(
            response({
                hloc: {
                    'AAPL.US': [
                        [12, 10, 11, 11.5],
                        [11, 9, 10, 10.5],
                    ],
                },
                vl: { 'AAPL.US': [2, 1] },
                xSeries: { 'AAPL.US': [200, 100] },
            }),
        );
        expect(outOfOrder).toBe(1);
        expect(bars.map((bar) => bar.time)).toEqual([100_000, 200_000]);
    });

    it('повторяющаяся метка времени схлопывается в последний бар', () => {
        const { bars, duplicates } = readIguanaResponse(
            response({
                hloc: {
                    'AAPL.US': [
                        [11, 9, 10, 10.5],
                        [12, 10, 10, 11.9],
                    ],
                },
                vl: { 'AAPL.US': [1, 2] },
                xSeries: { 'AAPL.US': [100, 100] },
            }),
        );
        expect(duplicates).toBe(1);
        expect(bars.length).toBe(1);
        expect(bars[0]!.close).toBe(11.9);
    });

    it('время строго возрастает — на этом держится модель', () => {
        const { bars } = readIguanaResponse(
            response({
                hloc: {
                    'AAPL.US': [
                        [11, 9, 10, 10.5],
                        [12, 10, 11, 11.5],
                        [13, 11, 12, 12.5],
                    ],
                },
                vl: { 'AAPL.US': [1, 2, 3] },
                xSeries: { 'AAPL.US': [300, 100, 100] },
            }),
        );
        for (let i = 1; i < bars.length; i += 1) {
            expect(bars[i]!.time).toBeGreaterThan(bars[i - 1]!.time);
        }
    });

    it('выбирает первый тикер, если он не указан', () => {
        const many = response({
            hloc: { 'AAPL.US': [[11, 9, 10, 10.5]], 'SBER': [[2, 1, 1.5, 1.8]] },
            vl: { 'AAPL.US': [1], SBER: [2] },
            xSeries: { 'AAPL.US': [100], SBER: [100] },
        });
        expect(readIguanaResponse(many).ticker).toBe('AAPL.US');
        expect(readIguanaResponse(many, 'SBER').bars[0]!.close).toBe(1.8);
    });

    it('пустой и неполный ответ не роняют чтение', () => {
        expect(readIguanaResponse({}).bars).toEqual([]);
        expect(readIguanaResponse({}).ticker).toBeNull();
        expect(readIguanaResponse({ hloc: { X: [] } }).bars).toEqual([]);
        expect(readIguanaResponse(response(), 'НЕТ_ТАКОГО').bars).toEqual([]);
    });

    it('tickersOf перечисляет инструменты ответа', () => {
        expect(tickersOf(response())).toEqual(['AAPL.US']);
        expect(tickersOf({})).toEqual([]);
    });
});

describe('barFromHlocRow', () => {
    it('читает одиночный бар для обновления по вебсокету', () => {
        expect(barFromHlocRow(1_700_000_000, [11, 9, 10, 10.5], 500)).toEqual({
            time: 1_700_000_000_000,
            high: 11,
            low: 9,
            open: 10,
            close: 10.5,
            volume: 500,
        });
    });

    it('незаполненный бар отвергается', () => {
        expect(barFromHlocRow(1, [null, null, null, null] as unknown as number[])).toBeNull();
        expect(barFromHlocRow('нет', [1, 2, 3, 4])).toBeNull();
    });

    it('нечисловой объём становится нулём', () => {
        expect(barFromHlocRow(1, [11, 9, 10, 10.5], 'нет')!.volume).toBe(0);
    });
});
