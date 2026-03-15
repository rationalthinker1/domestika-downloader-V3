/**
 * Debug logging utility
 * Only logs when DEBUG=true in .env file
 */

import type * as cliProgress from 'cli-progress';
import { logger } from './logger';

const isDebugMode = process.env.DEBUG === 'true';

// Store active multiBar for logging
let activeMultiBar: cliProgress.MultiBar | null = null;

export function setActiveMultiBar(multiBar: cliProgress.MultiBar | null): void {
	activeMultiBar = multiBar;
}

export function getActiveMultiBar(): cliProgress.MultiBar | null {
	return activeMultiBar;
}

export function log(message: string, multiBar?: cliProgress.MultiBar | null): void {
	logger.info(message, multiBar ?? activeMultiBar);
}

export function logError(message: string, multiBar?: cliProgress.MultiBar | null): void {
	logger.error(message, multiBar ?? activeMultiBar);
}

export function debugLog(...args: unknown[]): void {
	if (isDebugMode) {
		const message = args
			.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
			.join(' ');
		logger.debug(message, activeMultiBar);
	}
}

/**
 * Check if debug mode is enabled
 */
export function isDebug(): boolean {
	return isDebugMode;
}

/**
 * Logs current process memory usage as a debug message.
 */
export function logMemoryUsage(label: string): void {
	const usage = process.memoryUsage();
	const formatMB = (bytes: number): string => (bytes / 1024 / 1024).toFixed(2);
	debugLog(
		`[MEMORY] ${label}: RSS=${formatMB(usage.rss)}MB, HeapUsed=${formatMB(usage.heapUsed)}MB, HeapTotal=${formatMB(usage.heapTotal)}MB, External=${formatMB(usage.external)}MB`
	);
}
