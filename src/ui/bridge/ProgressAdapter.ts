import { bus } from '../AppEventBus';

interface FakeBar {
	update(value: number, payload?: { title?: string }): void;
}

/**
 * Drop-in replacement for cliProgress.MultiBar that emits bus events instead
 * of writing to stdout. Used during download phase so Ink can render progress bars.
 */
export class InkMultiBar {
	create(_total: number, _startValue: number, payload: { title?: string }): FakeBar {
		const videoId = payload.title ?? `video-${Math.random()}`;
		const title = payload.title ?? '';

		bus.emit('download:status', { videoId, title, status: 'downloading' });

		return {
			update(value: number, p?: { title?: string }) {
				const currentTitle = p?.title ?? title;
				bus.emit('download:progress', {
					videoId,
					title: currentTitle,
					percent: value,
				});
				if (value >= 100) {
					bus.emit('download:status', {
						videoId,
						title: currentTitle,
						status: 'done',
					});
				}
			},
		};
	}

	remove(_bar: FakeBar): void {
		// bars auto-clear in the UI after completion
	}

	stop(): void {
		// no-op: Ink handles teardown
	}

	log(message: string): void {
		const trimmed = message.trim();
		if (trimmed) {
			bus.emit('log', { level: 'info', message: trimmed });
		}
	}
}
