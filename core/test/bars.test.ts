import { describe, expect, it } from 'vitest';
import { BarSeries } from '../src/model/bars.js';
import { randomWalk } from './helpers.js';

describe('BarSeries', () => {
    it('хранит бары и отдаёт их по индексу', () => {
        const bars = randomWalk(10);
        const series = new BarSeries();
        series.setData(bars);

        expect(series.length).toBe(10);
        expect(series.barAt(0)).toEqual(bars[0]);
        expect(series.barAt(9)).toEqual(bars[9]);
    });

    it('растёт за пределы начальной ёмкости без потери данных', () => {
        const bars = randomWalk(5000);
        const series = new BarSeries(16);
        for (const bar of bars) series.append(bar);

        expect(series.length).toBe(5000);
        expect(series.closeAt(0)).toBe(bars[0]!.close);
        expect(series.closeAt(4999)).toBe(bars[4999]!.close);
    });

    it('повторный setData с меньшим набором не падает', () => {
        // Смена инструмента на бумагу с меньшей историей: раньше здесь летел
        // RangeError, потому что копировалась старая длина в новый буфер.
        const series = new BarSeries();
        series.setData(randomWalk(5000));

        const smaller = randomWalk(50, 2);
        expect(() => series.setData(smaller)).not.toThrow();
        expect(series.length).toBe(50);
        expect(series.closeAt(0)).toBe(smaller[0]!.close);
        expect(series.closeAt(49)).toBe(smaller[49]!.close);
    });

    it('setData после append с меньшим набором не падает', () => {
        const series = new BarSeries(16);
        for (const bar of randomWalk(3000)) series.append(bar);

        const smaller = randomWalk(10, 5);
        expect(() => series.setData(smaller)).not.toThrow();
        expect(series.length).toBe(10);
    });

    it('setData после prepend с меньшим набором не падает', () => {
        const all = randomWalk(400, 7);
        const series = new BarSeries(32);
        series.setData(all.slice(200));
        series.prepend(all.slice(0, 200));

        expect(() => series.setData(randomWalk(5, 9))).not.toThrow();
        expect(series.length).toBe(5);
    });

    it('setData пустым набором опустошает ряд', () => {
        const series = new BarSeries();
        series.setData(randomWalk(100));
        series.setData([]);

        expect(series.length).toBe(0);
        const { min, max } = series.lowHighInRange(0, 0);
        expect(min).toBeNaN();
        expect(max).toBeNaN();
    });

    it('чередование больших и малых наборов остаётся согласованным', () => {
        const series = new BarSeries();
        for (const count of [1000, 10, 5000, 3, 200]) {
            const bars = randomWalk(count, count);
            series.setData(bars);
            expect(series.length).toBe(count);
            expect(series.timeAt(count - 1)).toBe(bars[count - 1]!.time);
        }
    });

    it('updateLast перезаписывает последний бар, не добавляя новый', () => {
        const series = new BarSeries();
        series.setData(randomWalk(3));
        const patched = { ...series.barAt(2), close: 42 };
        series.updateLast(patched);

        expect(series.length).toBe(3);
        expect(series.closeAt(2)).toBe(42);
    });

    it('prepend ставит историю слева и сохраняет порядок', () => {
        const all = randomWalk(100);
        const series = new BarSeries(64);
        series.setData(all.slice(50));
        series.prepend(all.slice(0, 50));

        expect(series.length).toBe(100);
        for (let i = 0; i < 100; i += 1) {
            expect(series.timeAt(i)).toBe(all[i]!.time);
            expect(series.closeAt(i)).toBe(all[i]!.close);
        }
    });

    it('многократный prepend не разъезжается при переаллокациях', () => {
        const all = randomWalk(300);
        const series = new BarSeries(8);
        series.setData(all.slice(280));
        for (let start = 280; start > 0; start -= 20) {
            series.prepend(all.slice(start - 20, start));
        }

        expect(series.length).toBe(300);
        expect(series.timeAt(0)).toBe(all[0]!.time);
        expect(series.timeAt(299)).toBe(all[299]!.time);
    });

    it('lowHighInRange совпадает с наивным проходом', () => {
        const bars = randomWalk(500, 7);
        const series = new BarSeries();
        series.setData(bars);

        const slice = bars.slice(120, 301);
        const expected = {
            min: Math.min(...slice.map((b) => b.low)),
            max: Math.max(...slice.map((b) => b.high)),
        };
        expect(series.lowHighInRange(120, 300)).toEqual(expected);
    });

    it('volumeMaxInRange совпадает с наивным проходом', () => {
        const bars = randomWalk(300, 13);
        const series = new BarSeries();
        series.setData(bars);

        const slice = bars.slice(40, 181);
        expect(series.volumeMaxInRange(40, 180)).toBe(Math.max(...slice.map((b) => b.volume)));
    });

    it('lowHighInRange отдаёт NaN на пустом диапазоне', () => {
        const series = new BarSeries();
        series.setData(randomWalk(5));
        const { min, max } = series.lowHighInRange(4, 2);
        expect(min).toBeNaN();
        expect(max).toBeNaN();
    });

    it('indexOfTime находит бар, а при промахе — ближайший слева', () => {
        const bars = randomWalk(50);
        const series = new BarSeries();
        series.setData(bars);

        expect(series.indexOfTime(bars[20]!.time)).toBe(20);
        expect(series.indexOfTime(bars[20]!.time + 1)).toBe(20);
        expect(series.indexOfTime(bars[0]!.time - 1)).toBe(-1);
    });
});
