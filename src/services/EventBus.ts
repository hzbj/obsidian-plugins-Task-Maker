import { EventMap } from '../models/types';

type EventCallback<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class EventBus {
	private listeners: Map<string, Set<EventCallback<any>>> = new Map();

	on<K extends keyof EventMap>(event: K, callback: EventCallback<K>): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
	}

	off<K extends keyof EventMap>(event: K, callback: EventCallback<K>): void {
		const set = this.listeners.get(event);
		if (set) {
			set.delete(callback);
		}
	}

	emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
		const set = this.listeners.get(event);
		if (set) {
			set.forEach(cb => {
				try {
					cb(payload);
				} catch (e) {
					console.error(`[TaskMaker] EventBus error on "${event}":`, e);
				}
			});
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}
