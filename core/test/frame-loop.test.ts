import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invalidation } from '../src/model/invalidation.js';
import { FrameLoop } from '../src/render/frame-loop.js';

/** Ручной планировщик кадров: тесты не должны зависеть от реального rAF. */
function manualScheduler() {
    let next = 1;
    const pending = new Map<number, FrameRequestCallback>();
    return {
        request: (cb: FrameRequestCallback): number => {
            const handle = next++;
            pending.set(handle, cb);
            return handle;
        },
        cancel: (handle: number): void => void pending.delete(handle),
        runFrame(): void {
            const entries = [...pending.entries()];
            pending.clear();
            for (const [, cb] of entries) cb(0);
        },
        get pendingCount(): number {
            return pending.size;
        },
    };
}

describe('FrameLoop', () => {
    let scheduler: ReturnType<typeof manualScheduler>;

    beforeEach(() => {
        scheduler = manualScheduler();
    });

    it('несколько invalidate за кадр дают одну отрисовку', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.Cursor);
        loop.invalidate(Invalidation.Cursor);
        loop.invalidate(Invalidation.Light);
        expect(onFrame).not.toHaveBeenCalled();

        scheduler.runFrame();
        expect(onFrame).toHaveBeenCalledTimes(1);
    });

    it('за кадр берётся максимальный уровень', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.Cursor);
        loop.invalidate(Invalidation.Full);
        loop.invalidate(Invalidation.Light);
        scheduler.runFrame();

        expect(onFrame).toHaveBeenCalledWith(Invalidation.Full);
    });

    it('уровень сбрасывается после кадра', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.Full);
        scheduler.runFrame();
        scheduler.runFrame();

        expect(onFrame).toHaveBeenCalledTimes(1);
    });

    it('Invalidation.None не планирует кадр', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.None);
        expect(scheduler.pendingCount).toBe(0);
        scheduler.runFrame();
        expect(onFrame).not.toHaveBeenCalled();
    });

    it('flush рисует немедленно и снимает запланированный кадр', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.Light);
        loop.flush();
        expect(onFrame).toHaveBeenCalledTimes(1);

        scheduler.runFrame();
        expect(onFrame).toHaveBeenCalledTimes(1);
    });

    it('после dispose кадры не приходят', () => {
        const onFrame = vi.fn();
        const loop = new FrameLoop(onFrame, scheduler.request, scheduler.cancel);

        loop.invalidate(Invalidation.Full);
        loop.dispose();
        scheduler.runFrame();
        loop.invalidate(Invalidation.Full);
        scheduler.runFrame();

        expect(onFrame).not.toHaveBeenCalled();
    });
});
