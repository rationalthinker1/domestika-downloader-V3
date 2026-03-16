import { useReducer, useEffect } from 'react';
import { bus } from './AppEventBus';
import type {
	CourseStatus,
	DownloadStatus,
	LogEvent,
	PromptRequestEvent,
	PromptConfirmEvent,
	PromptCheckboxEvent,
} from './AppEventBus';

export type AppPhase =
	| 'starting'
	| 'auth'
	| 'running'
	| 'downloading'
	| 'video-select'
	| 'summary'
	| 'error';

export interface DownloadRow {
	videoId: string;
	title: string;
	percent: number;
	status: DownloadStatus;
}

export interface CourseRow {
	url: string;
	title: string;
	status: CourseStatus;
}

export interface PendingPrompt {
	type: 'text' | 'confirm' | 'checkbox';
	promptId: string;
	message: string;
	field?: string;
	mask?: boolean;
	choices?: Array<{ name: string; value: unknown; isHeader?: boolean }>;
}

export interface AppState {
	phase: AppPhase;
	courses: CourseRow[];
	downloads: Map<string, DownloadRow>;
	logs: LogEvent[];
	summary: { downloaded: number; skipped: number; failed: number } | null;
	errorMessage: string | null;
	pendingPrompt: PendingPrompt | null;
	scraping: boolean;
	scrapeUnitCount: number;
}

const MAX_LOGS = 100;

export type AppAction =
	| { type: 'SET_PHASE'; phase: AppPhase }
	| { type: 'SET_ERROR'; message: string }
	| { type: 'COURSE_STATUS'; url: string; title: string; status: CourseStatus }
	| { type: 'DOWNLOAD_PROGRESS'; videoId: string; title: string; percent: number }
	| { type: 'DOWNLOAD_STATUS'; videoId: string; title: string; status: DownloadStatus }
	| { type: 'ADD_LOG'; log: LogEvent }
	| { type: 'SET_SUMMARY'; downloaded: number; skipped: number; failed: number }
	| { type: 'SET_PROMPT'; prompt: PendingPrompt | null }
	| { type: 'SCRAPE_START' }
	| { type: 'SCRAPE_UNITS_FOUND'; count: number }
	| { type: 'SCRAPE_DONE' };

function reducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case 'SET_PHASE':
			return { ...state, phase: action.phase };

		case 'SET_ERROR':
			return { ...state, phase: 'error', errorMessage: action.message };

		case 'COURSE_STATUS': {
			const existing = state.courses.find((c) => c.url === action.url);
			if (existing) {
				return {
					...state,
					courses: state.courses.map((c) =>
						c.url === action.url ? { ...c, title: action.title, status: action.status } : c
					),
				};
			}
			return {
				...state,
				courses: [...state.courses, { url: action.url, title: action.title, status: action.status }],
			};
		}

		case 'DOWNLOAD_PROGRESS': {
			const next = new Map(state.downloads);
			const existing = next.get(action.videoId);
			next.set(action.videoId, {
				videoId: action.videoId,
				title: action.title,
				percent: action.percent,
				status: existing?.status === 'done' ? 'done' : 'downloading',
			});
			return { ...state, downloads: next, phase: 'downloading' };
		}

		case 'DOWNLOAD_STATUS': {
			const next = new Map(state.downloads);
			const existing = next.get(action.videoId);
			next.set(action.videoId, {
				videoId: action.videoId,
				title: action.title,
				percent: action.status === 'done' ? 100 : (existing?.percent ?? 0),
				status: action.status,
			});
			return { ...state, downloads: next };
		}

		case 'ADD_LOG': {
			const logs = [...state.logs, action.log].slice(-MAX_LOGS);
			return { ...state, logs };
		}

		case 'SET_SUMMARY':
			return {
				...state,
				phase: 'summary',
				summary: { downloaded: action.downloaded, skipped: action.skipped, failed: action.failed },
			};

		case 'SET_PROMPT':
			return {
				...state,
				phase: action.prompt ? (action.prompt.type === 'checkbox' ? 'video-select' : 'auth') : state.phase,
				pendingPrompt: action.prompt,
			};

		case 'SCRAPE_START':
			return { ...state, scraping: true, scrapeUnitCount: 0 };

		case 'SCRAPE_UNITS_FOUND':
			return { ...state, scrapeUnitCount: action.count };

		case 'SCRAPE_DONE':
			return { ...state, scraping: false };

		default:
			return state;
	}
}

const initialState: AppState = {
	phase: 'starting',
	courses: [],
	downloads: new Map(),
	logs: [],
	summary: null,
	errorMessage: null,
	pendingPrompt: null,
	scraping: false,
	scrapeUnitCount: 0,
};

export function useAppState() {
	const [state, dispatch] = useReducer(reducer, initialState);

	useEffect(() => {
		const onCourseStatus = (data: { courseUrl: string; title: string; status: CourseStatus }) => {
			dispatch({ type: 'COURSE_STATUS', url: data.courseUrl, title: data.title, status: data.status });
			if (data.status === 'processing') {
				dispatch({ type: 'SET_PHASE', phase: 'running' });
			}
		};

		const onDownloadProgress = (data: { videoId: string; title: string; percent: number }) => {
			dispatch({ type: 'DOWNLOAD_PROGRESS', ...data });
		};

		const onDownloadStatus = (data: { videoId: string; title: string; status: DownloadStatus }) => {
			dispatch({ type: 'DOWNLOAD_STATUS', ...data });
		};

		const onLog = (data: LogEvent) => {
			dispatch({ type: 'ADD_LOG', log: data });
		};

		const onSummary = (data: { downloaded: number; skipped: number; failed: number }) => {
			dispatch({ type: 'SET_SUMMARY', ...data });
		};

		const onFatalError = (data: { message: string }) => {
			dispatch({ type: 'SET_ERROR', message: data.message });
		};

		const onScrapeStart = () => {
			dispatch({ type: 'SCRAPE_START' });
		};

		const onScrapeUnitsFound = (data: { count: number; courseUrl: string }) => {
			dispatch({ type: 'SCRAPE_UNITS_FOUND', count: data.count });
		};

		const onScrapeDone = () => {
			dispatch({ type: 'SCRAPE_DONE' });
		};

		const onPromptRequest = (data: PromptRequestEvent) => {
			dispatch({
				type: 'SET_PROMPT',
				prompt: {
					type: 'text',
					promptId: data.promptId,
					message: data.message,
					field: data.field,
					mask: data.mask,
				},
			});
		};

		const onPromptConfirm = (data: PromptConfirmEvent) => {
			dispatch({
				type: 'SET_PROMPT',
				prompt: {
					type: 'confirm',
					promptId: data.promptId,
					message: data.message,
				},
			});
		};

		const onPromptCheckbox = (data: PromptCheckboxEvent) => {
			dispatch({
				type: 'SET_PROMPT',
				prompt: {
					type: 'checkbox',
					promptId: data.promptId,
					message: data.message,
					choices: data.choices.map((c) => ({
						name: c.name,
						value: c.value,
						isHeader: c.isHeader,
					})),
				},
			});
		};

		bus.on('course:status', onCourseStatus);
		bus.on('download:progress', onDownloadProgress);
		bus.on('download:status', onDownloadStatus);
		bus.on('log', onLog);
		bus.on('summary:done', onSummary);
		bus.on('error:fatal', onFatalError);
		bus.on('scrape:start', onScrapeStart);
		bus.on('scrape:units-found', onScrapeUnitsFound);
		bus.on('scrape:done', onScrapeDone);
		bus.on('prompt:request', onPromptRequest);
		bus.on('prompt:confirm', onPromptConfirm);
		bus.on('prompt:checkbox', onPromptCheckbox);

		return () => {
			bus.off('course:status', onCourseStatus);
			bus.off('download:progress', onDownloadProgress);
			bus.off('download:status', onDownloadStatus);
			bus.off('log', onLog);
			bus.off('summary:done', onSummary);
			bus.off('error:fatal', onFatalError);
			bus.off('scrape:start', onScrapeStart);
			bus.off('scrape:units-found', onScrapeUnitsFound);
			bus.off('scrape:done', onScrapeDone);
			bus.off('prompt:request', onPromptRequest);
			bus.off('prompt:confirm', onPromptConfirm);
			bus.off('prompt:checkbox', onPromptCheckbox);
		};
	}, []);

	return { state, dispatch };
}
