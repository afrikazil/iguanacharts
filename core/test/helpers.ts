import type { Bar } from '../src/model/bars.js';

/** Детерминированный ГПСЧ — тесты не должны мигать. */
export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomWalk(count: number, seed = 1, start = 100): Bar[] {
    const random = mulberry32(seed);
    const bars: Bar[] = [];
    let price = start;
    for (let i = 0; i < count; i += 1) {
        const open = price;
        const close = open * (1 + (random() - 0.5) * 0.04);
        const high = Math.max(open, close) * (1 + random() * 0.01);
        const low = Math.min(open, close) * (1 - random() * 0.01);
        bars.push({
            time: Date.UTC(2024, 0, 1) + i * 86_400_000,
            open,
            high,
            low,
            close,
            volume: Math.round(random() * 1_000_000),
        });
        price = close;
    }
    return bars;
}
