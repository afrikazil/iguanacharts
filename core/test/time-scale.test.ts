import { describe, expect, it } from 'vitest';
import { TimeScale } from '../src/model/time-scale.js';

function scale(barCount = 1000, width = 800, barSpacing = 8): TimeScale {
    const timeScale = new TimeScale({ barSpacing });
    timeScale.setWidth(width);
    timeScale.setBarCount(barCount);
    return timeScale;
}

describe('TimeScale', () => {
    it('xAt и logicalAt взаимно обратны', () => {
        const timeScale = scale();
        for (const logical of [0, 1, 123.5, 999]) {
            expect(timeScale.logicalAt(timeScale.xAt(logical))).toBeCloseTo(logical, 9);
        }
    });

    it('при rightOffset = 0 последний бар стоит у правого края', () => {
        const timeScale = scale();
        timeScale.setRightOffset(0);
        expect(timeScale.xAt(999)).toBeCloseTo(800, 9);
    });

    it('расстояние между соседними барами равно barSpacing независимо от времени', () => {
        // Именно это свойство убирает разрывы выходных: ось живёт в индексах.
        const timeScale = scale(1000, 800, 6);
        expect(timeScale.xAt(11) - timeScale.xAt(10)).toBeCloseTo(6, 9);
        expect(timeScale.xAt(701) - timeScale.xAt(700)).toBeCloseTo(6, 9);
    });

    it('zoomAt удерживает бар под точкой якоря', () => {
        const timeScale = scale();
        const anchorX = 300;
        const before = timeScale.logicalAt(anchorX);
        timeScale.zoomAt(anchorX, 1.4);
        expect(timeScale.logicalAt(anchorX)).toBeCloseTo(before, 6);
    });

    it('zoomAt удерживает якорь и при отдалении', () => {
        const timeScale = scale();
        const anchorX = 640;
        const before = timeScale.logicalAt(anchorX);
        timeScale.zoomAt(anchorX, 0.5);
        expect(timeScale.logicalAt(anchorX)).toBeCloseTo(before, 6);
    });

    it('barSpacing ограничен настройками', () => {
        const timeScale = new TimeScale({ barSpacing: 8, minBarSpacing: 2, maxBarSpacing: 20 });
        timeScale.setWidth(800);
        timeScale.setBarCount(500);

        timeScale.setBarSpacing(1000);
        expect(timeScale.barSpacing).toBe(20);
        timeScale.setBarSpacing(0.01);
        expect(timeScale.barSpacing).toBe(2);
    });

    it('scrollBy двигает видимый диапазон на целое число баров', () => {
        const timeScale = scale(1000, 800, 8);
        const before = timeScale.visibleBars();
        timeScale.scrollBy(80); // 10 баров при spacing 8
        const after = timeScale.visibleBars();
        expect(before.from - after.from).toBe(10);
    });

    it('скролл не даёт увести данные за экран', () => {
        const timeScale = scale();
        timeScale.scrollBy(1e9);
        expect(timeScale.visibleBars().to).toBeGreaterThanOrEqual(0);
        timeScale.scrollBy(-1e9);
        expect(timeScale.visibleBars().from).toBeLessThan(1000);
    });

    it('fitContent укладывает все бары во вьюпорт', () => {
        const timeScale = scale(200, 800, 8);
        timeScale.fitContent();
        const visible = timeScale.visibleBars();
        expect(visible.from).toBe(0);
        expect(visible.to).toBe(199);
    });

    it('на пустых данных видимый диапазон пуст', () => {
        const timeScale = scale(0);
        const visible = timeScale.visibleBars();
        expect(visible.to).toBeLessThan(visible.from);
    });
});
