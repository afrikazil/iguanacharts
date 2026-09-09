export type Listener<T> = (payload: T) => void;

/** Минимальный типизированный эмиттер — замена $el.trigger('iguanaChartEvents'). */
export class Emitter<TEvents extends Record<string, unknown>> {
    private readonly listeners = new Map<keyof TEvents, Set<Listener<never>>>();

    on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): () => void {
        let set = this.listeners.get(event);
        if (set === undefined) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => this.off(event, listener);
    }

    off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
        this.listeners.get(event)?.delete(listener as Listener<never>);
    }

    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        const set = this.listeners.get(event);
        if (set === undefined) return;
        for (const listener of set) (listener as Listener<TEvents[K]>)(payload);
    }

    clear(): void {
        this.listeners.clear();
    }
}
