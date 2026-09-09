import { Invalidation, type InvalidationLevel } from '../model/invalidation.js';

export type FrameHandler = (level: InvalidationLevel) => void;

/**
 * Один rAF-цикл на весь график.
 *
 * Смысл не в самом rAF, а в схлопывании уровней: за один кадр может прийти
 * десяток invalidate от мыши, ресайза и тика по вебсокету — рисуем один раз и
 * по максимальному уровню. В старом коде перерисовка шла синхронно прямо из
 * обработчиков, поэтому один mousemove мог утащить за собой полный проход по
 * сериям.
 */
export class FrameLoop {
    private level: InvalidationLevel = Invalidation.None;
    private handle = 0;
    private disposed = false;

    constructor(
        private readonly onFrame: FrameHandler,
        private readonly requestFrame: (cb: FrameRequestCallback) => number = (cb) =>
            globalThis.requestAnimationFrame(cb),
        private readonly cancelFrame: (handle: number) => void = (handle) =>
            globalThis.cancelAnimationFrame(handle),
    ) {}

    invalidate(level: InvalidationLevel): void {
        if (this.disposed || level === Invalidation.None) return;
        if (level > this.level) this.level = level;
        if (this.handle === 0) this.handle = this.requestFrame(this.tick);
    }

    /** Отрисовать немедленно, минуя кадр — нужно для ресайза и скриншотов. */
    flush(): void {
        if (this.disposed || this.level === Invalidation.None) return;
        if (this.handle !== 0) {
            this.cancelFrame(this.handle);
            this.handle = 0;
        }
        const level = this.level;
        this.level = Invalidation.None;
        this.onFrame(level);
    }

    dispose(): void {
        this.disposed = true;
        if (this.handle !== 0) this.cancelFrame(this.handle);
        this.handle = 0;
        this.level = Invalidation.None;
    }

    private readonly tick = (): void => {
        this.handle = 0;
        if (this.disposed) return;
        const level = this.level;
        this.level = Invalidation.None;
        this.onFrame(level);
    };
}
