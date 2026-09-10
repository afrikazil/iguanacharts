import { describe, expect, it } from 'vitest';
import { TimeAxisFormatter, timeAxisFormatOptions } from '../src/render/time-format.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('timeAxisFormatOptions', () => {
    it('внутри суток показывает время', () => {
        expect(timeAxisFormatOptions(150 * MINUTE)).toEqual({ hour: '2-digit', minute: '2-digit' });
        expect(timeAxisFormatOptions(6 * HOUR)).toEqual({ hour: '2-digit', minute: '2-digit' });
    });

    it('на нескольких сутках добавляет время к дате', () => {
        expect(timeAxisFormatOptions(2 * DAY)).toEqual({
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    });

    it('на неделях и месяцах показывает дату', () => {
        expect(timeAxisFormatOptions(10 * DAY)).toEqual({ day: '2-digit', month: 'short' });
    });

    it('на годах показывает месяц с годом', () => {
        expect(timeAxisFormatOptions(400 * DAY)).toEqual({ month: 'short', year: 'numeric' });
    });

    it('на десятилетиях показывает только год', () => {
        expect(timeAxisFormatOptions(4000 * DAY)).toEqual({ year: 'numeric' });
    });
});

describe('TimeAxisFormatter', () => {
    it('сообщает о смене формата и молчит, когда он тот же', () => {
        const formatter = new TimeAxisFormatter('ru-RU');
        expect(formatter.setVisibleSpan(150 * MINUTE)).toBe(true);
        expect(formatter.setVisibleSpan(200 * MINUTE)).toBe(false);
        expect(formatter.setVisibleSpan(30 * DAY)).toBe(true);
    });

    it('минутный диапазон даёт разные подписи для соседних баров', () => {
        // Именно этого не было в первой версии: все подписи выводились как дата,
        // и на минутных барах ось превращалась в столбец одинаковых значений.
        const formatter = new TimeAxisFormatter('ru-RU');
        formatter.setVisibleSpan(150 * MINUTE);
        const base = Date.UTC(2024, 4, 10, 12, 0);
        expect(formatter.format(base)).not.toBe(formatter.format(base + 37 * MINUTE));
    });

    it('двухсуточный диапазон различает бары внутри одного дня', () => {
        const formatter = new TimeAxisFormatter('ru-RU');
        formatter.setVisibleSpan(2 * DAY);
        const base = Date.UTC(2024, 4, 10, 9, 0);
        expect(formatter.format(base)).not.toBe(formatter.format(base + 5 * HOUR));
    });

    it('пояс меняет подпись, не трогая данные', () => {
        const instant = Date.UTC(2024, 0, 15, 21, 30);
        const utc = new TimeAxisFormatter('ru-RU', 'UTC');
        const moscow = new TimeAxisFormatter('ru-RU', 'Europe/Moscow');
        utc.setVisibleSpan(3 * HOUR);
        moscow.setVisibleSpan(3 * HOUR);

        expect(utc.format(instant)).toBe('21:30');
        expect(moscow.format(instant)).toBe('00:30');
    });

    it('переход на летнее время учитывается по дате бара, а не по «сейчас»', () => {
        // Ровно это ломалось в legacy: смещение брали через
        // new Date().getTimezoneOffset() один раз и применяли ко всей истории,
        // поэтому бары из другой половины года уезжали на час.
        const london = new TimeAxisFormatter('ru-RU', 'Europe/London');
        london.setVisibleSpan(3 * HOUR);

        const winter = Date.UTC(2024, 0, 15, 12, 0);
        const summer = Date.UTC(2024, 6, 15, 12, 0);

        expect(london.format(winter)).toBe('12:00');
        expect(london.format(summer)).toBe('13:00');
    });

    it('дневной диапазон даёт разные подписи для соседних дней', () => {
        const formatter = new TimeAxisFormatter('ru-RU');
        formatter.setVisibleSpan(30 * DAY);
        const base = Date.UTC(2024, 4, 10);
        expect(formatter.format(base)).not.toBe(formatter.format(base + DAY));
    });
});
