import { bus } from '../AppEventBus';

export const inkLogger = {
	info(message: string): void {
		bus.emit('log', { level: 'info', message });
	},

	success(message: string): void {
		bus.emit('log', { level: 'success', message });
	},

	warn(message: string): void {
		bus.emit('log', { level: 'warn', message });
	},

	error(message: string): void {
		bus.emit('log', { level: 'error', message });
	},

	skip(message: string): void {
		bus.emit('log', { level: 'skip', message });
	},

	step(message: string): void {
		bus.emit('log', { level: 'step', message });
	},

	header(message: string): void {
		bus.emit('log', { level: 'info', message: `── ${message} ──` });
	},

	list(items: string[]): void {
		for (const item of items) {
			bus.emit('log', { level: 'info', message: `  · ${item}` });
		}
	},

	debug(message: string): void {
		bus.emit('log', { level: 'debug', message });
	},
};
