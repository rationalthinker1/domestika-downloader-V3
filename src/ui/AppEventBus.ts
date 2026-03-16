import { EventEmitter } from 'node:events';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed' | 'skipped';
export type CourseStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface DownloadProgressEvent {
	videoId: string;
	title: string;
	percent: number;
}

export interface DownloadStatusEvent {
	videoId: string;
	title: string;
	status: DownloadStatus;
}

export interface CourseStatusEvent {
	courseUrl: string;
	title: string;
	status: CourseStatus;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'skip' | 'step' | 'debug';

export interface LogEvent {
	level: LogLevel;
	message: string;
}

export interface PromptAnswerEvent {
	promptId: string;
	answer: unknown;
}

export interface PromptRequestEvent {
	promptId: string;
	field: string;
	message: string;
	mask?: boolean;
}

export interface PromptConfirmEvent {
	promptId: string;
	message: string;
}

export interface PromptCheckboxItem {
	name: string;
	value: unknown;
	checked?: boolean;
	isHeader?: boolean;
}

export interface PromptCheckboxEvent {
	promptId: string;
	message: string;
	choices: PromptCheckboxItem[];
}

export interface AppEvents {
	'course:status': CourseStatusEvent;
	'download:progress': DownloadProgressEvent;
	'download:status': DownloadStatusEvent;
	'scrape:start': { courseUrl: string };
	'scrape:units-found': { count: number; courseUrl: string };
	'scrape:done': { courseUrl: string };
	'log': LogEvent;
	'prompt:request': PromptRequestEvent;
	'prompt:answer': PromptAnswerEvent;
	'prompt:confirm': PromptConfirmEvent;
	'prompt:checkbox': PromptCheckboxEvent;
	'summary:done': { downloaded: number; skipped: number; failed: number };
	'error:fatal': { message: string };
	'error:cookie-expired': { courseUrl: string };
	'app:start': Record<string, never>;
	'app:done': Record<string, never>;
}

class AppEventBus extends EventEmitter {
	override emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): boolean {
		return super.emit(event as string, data);
	}

	override on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
		return super.on(event as string, listener);
	}

	override once<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
		return super.once(event as string, listener);
	}

	override off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
		return super.off(event as string, listener);
	}
}

export const bus = new AppEventBus();
bus.setMaxListeners(50);
