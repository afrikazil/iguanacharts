import { describe, expect, it } from 'vitest';
import { Rsi } from '../src/indicators/rsi.js';
import { DARK_COLORS, LIGHT_COLORS, THEMES } from '../src/chart.js';
import { IndicatorSource } from '../src/series/indicator-source.js';

describe('встроенные палитры', () => {
    it('светлая и тёмная описывают один и тот же набор ключей', () => {
        expect(Object.keys(LIGHT_COLORS).sort()).toEqual(Object.keys(DARK_COLORS).sort());
    });

    it('ни один цвет не остался пустым', () => {
        for (const [name, colors] of Object.entries(THEMES)) {
            for (const [key, value] of Object.entries(colors)) {
                expect(value, `${name}.${key}`).toMatch(/^(#|rgba?\()/);
            }
        }
    });

    it('фон светлой и тёмной различаются', () => {
        expect(LIGHT_COLORS.background).not.toBe(DARK_COLORS.background);
    });
});

describe('IndicatorSource.applyTheme', () => {
    const style = (source: IndicatorSource): { color: string; levelColor: string } =>
        (source as unknown as { options: { color: string; levelColor: string } }).options;

    it('цвет, заданный вызывающим, тема не перекрывает', () => {
        // У пользователя может быть настроен красный RSI — смена темы не должна
        // сбрасывать его выбор.
        const source = new IndicatorSource(new Rsi(14), { color: '#ff0000' }, true);
        source.applyTheme('#2196f3', '#2a2e39');
        expect(style(source).color).toBe('#ff0000');
    });

    it('цвет по умолчанию тема перекрывает', () => {
        const source = new IndicatorSource(new Rsi(14), { color: '#2196f3' }, false);
        source.applyTheme('#1565c0', '#dddddd');
        expect(style(source).color).toBe('#1565c0');
    });

    it('цвет уровней подчиняется теме всегда', () => {
        const source = new IndicatorSource(new Rsi(14), { color: '#ff0000' }, true);
        source.applyTheme('#2196f3', '#dddddd');
        expect(style(source).levelColor).toBe('#dddddd');
    });
});
