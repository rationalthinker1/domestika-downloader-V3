import * as fs from 'node:fs';
import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import { InkApp } from './ui/InkApp';
import { bus } from './ui/AppEventBus';
import { inkLogger } from './ui/bridge/LoggerAdapter';
import { setLoggerImpl } from './utils/logger';
import domestikaAuth from './auth';
import { readInputCSV } from './csv/input';
import { loadProgress, saveProgress } from './csv/progress';
import { scrapeSite } from './scraper/scraper';
import type { CourseToProcess, DownloadOption } from './types';
import { logMemoryUsage } from './utils/debug';
import { getN3u8DLPath } from './utils/paths';
import { parseSubtitleLanguages } from './utils/subtitles';
import { DOMESTIKA_URL_PATTERN, normalizeDomestikaUrl } from './utils/url';

// ---------------------------------------------------------------------------
// Install Ink-aware logger before anything else runs
// ---------------------------------------------------------------------------

setLoggerImpl(inkLogger);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function courseDisplayName(course: Pick<CourseToProcess, 'courseTitle' | 'url'>): string {
	return course.courseTitle ?? course.url;
}

function toCourseToProcess(
	url: string,
	subtitles: string[] | null,
	downloadOption: DownloadOption
): CourseToProcess {
	const normalized = normalizeDomestikaUrl(url);
	return {
		url: normalized.url,
		courseTitle: normalized.courseTitle,
		subtitles,
		downloadOption,
	};
}

function isValidDomestikaUrl(url: string): boolean {
	return !!url.match(DOMESTIKA_URL_PATTERN);
}

function resolveCoursesFromCsv(): CourseToProcess[] {
	const csvCourses = readInputCSV();
	if (!csvCourses?.length) return [];

	inkLogger.info(`Found ${csvCourses.length} courses in input.csv`);
	return csvCourses.map((course) =>
		toCourseToProcess(
			course.url,
			parseSubtitleLanguages(course.subtitles),
			course.downloadOption || 'all'
		)
	);
}

function parseArgs(): { urls?: string; subtitles?: string; download?: string } {
	const args = process.argv.slice(2);
	const result: { urls?: string; subtitles?: string; download?: string } = {};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--urls' && args[i + 1]) result.urls = args[++i];
		else if (args[i] === '--subtitles' && args[i + 1]) result.subtitles = args[++i];
		else if (args[i] === '--download' && args[i + 1]) result.download = args[++i];
	}
	return result;
}

function resolveCoursesFromArgs(): CourseToProcess[] {
	const { urls: rawUrls, subtitles, download } = parseArgs();

	if (!rawUrls) {
		throw new Error('--urls is required. Provide one or more Domestika course URLs separated by commas.');
	}

	const subtitleLangs = parseSubtitleLanguages(subtitles ?? 'en');
	const downloadOption = (download ?? 'all') as DownloadOption;

	const urls = rawUrls.split(',').map((u) => u.trim()).filter(Boolean);
	if (!urls.every(isValidDomestikaUrl)) {
		throw new Error('Please provide valid Domestika course URLs');
	}

	inkLogger.step('Using command-line arguments:');
	inkLogger.list([
		`URLs: ${urls.join(', ')}`,
		`Subtitles: ${subtitleLangs ? subtitleLangs.join(', ') : 'None'}`,
		`Download: ${downloadOption}`,
	]);

	return urls.map((url) => toCourseToProcess(url, subtitleLangs, downloadOption));
}

// ---------------------------------------------------------------------------
// Main — imperative orchestration (called after Ink UI mounts)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	try {
		const auth = await domestikaAuth.getCookies();

		let coursesToProcess: CourseToProcess[];

		const fromCsv = resolveCoursesFromCsv();
		if (fromCsv.length > 0) {
			coursesToProcess = fromCsv;
		} else {
			coursesToProcess = resolveCoursesFromArgs();
		}

		const n3u8dlPath = getN3u8DLPath();
		if (!fs.existsSync(n3u8dlPath)) {
			throw new Error(
				`${n3u8dlPath} not found! Download the binary here: https://github.com/nilaoda/N_m3u8DL-RE/releases`
			);
		}

		if (coursesToProcess.length === 0) {
			inkLogger.warn('No courses to process.');
			bus.emit('summary:done', { downloaded: 0, skipped: 0, failed: 0 });
			return;
		}

		logMemoryUsage('Before loadProgress');
		const completedVideos = loadProgress();
		logMemoryUsage(`After loadProgress (${completedVideos.size} videos in set)`);

		// Announce all courses to the UI
		for (const course of coursesToProcess) {
			bus.emit('course:status', {
				courseUrl: course.url,
				title: courseDisplayName(course),
				status: 'pending',
			});
		}

		for (const [i, course] of coursesToProcess.entries()) {
			inkLogger.info(`[${i + 1}/${coursesToProcess.length}] ${courseDisplayName(course)}`);
			logMemoryUsage(`Before processing course ${i + 1}`);

			bus.emit('course:status', {
				courseUrl: course.url,
				title: courseDisplayName(course),
				status: 'processing',
			});

			try {
				saveProgress(course.url, course.courseTitle, 'processing');

				await scrapeSite(
					course.url,
					course.subtitles,
					auth,
					course.downloadOption,
					course.courseTitle,
					completedVideos
				);

				logMemoryUsage(`After processing course ${i + 1}`);
				inkLogger.success(`Course done: ${courseDisplayName(course)}`);

				bus.emit('course:status', {
					courseUrl: course.url,
					title: courseDisplayName(course),
					status: 'done',
				});
			} catch (error) {
				const err = error as Error;
				saveProgress(course.url, course.courseTitle, 'failed');
				inkLogger.error(`Course failed: ${courseDisplayName(course)} — ${err.message}`);

				bus.emit('course:status', {
					courseUrl: course.url,
					title: courseDisplayName(course),
					status: 'failed',
				});

				logMemoryUsage(`After failed course ${i + 1}`);
			}
		}

		inkLogger.success('All courses have been processed');
	} catch (error) {
		const err = error as Error;
		bus.emit('error:fatal', { message: err.message });
	}
}

// ---------------------------------------------------------------------------
// Entry point — render Ink UI, then start main() once mounted
// ---------------------------------------------------------------------------

// ESM entry guard
{
	const { waitUntilExit } = render(
		React.createElement(InkApp, {
			onReady: () => {
				main().catch((error: Error) => {
					bus.emit('error:fatal', { message: `Fatal error: ${error.message}` });
				});
			},
		})
	);

	waitUntilExit().then(() => process.exit(0)).catch(() => process.exit(1));
}
