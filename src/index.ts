import * as fs from 'node:fs';
import 'dotenv/config';
import domestikaAuth from './auth';
import { readInputCSV } from './csv/input';
import { loadProgress, saveProgress } from './csv/progress';
import { scrapeSite } from './scraper/scraper';
import type { CourseToProcess, DownloadOption } from './types';
import { logMemoryUsage } from './utils/debug';
import { logger } from './utils/logger';
import { getN3u8DLPath } from './utils/paths';
import { parseSubtitleLanguages } from './utils/subtitles';
import { DOMESTIKA_URL_PATTERN, normalizeDomestikaUrl } from './utils/url';

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

	logger.info(`Found ${csvCourses.length} courses in input.csv`);
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

	logger.step('Using command-line arguments:');
	logger.list([
		`URLs: ${urls.join(', ')}`,
		`Subtitles: ${subtitleLangs ? subtitleLangs.join(', ') : 'None'}`,
		`Download: ${downloadOption}`,
	]);

	return urls.map((url) => toCourseToProcess(url, subtitleLangs, downloadOption));
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
	try {
		logger.header('Domestika Downloader');

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
			logger.warn('No courses to process.');
			return;
		}

		logMemoryUsage('Before loadProgress');
		const completedVideos = loadProgress();
		logMemoryUsage(`After loadProgress (${completedVideos.size} videos in set)`);

		logger.header(`${coursesToProcess.length} course(s) to process`);
		logger.list(coursesToProcess.map((c, i) => `${i + 1}. ${courseDisplayName(c)}`));

		for (const [i, course] of coursesToProcess.entries()) {
			logger.header(`[${i + 1}/${coursesToProcess.length}] ${courseDisplayName(course)}`);
			logMemoryUsage(`Before processing course ${i + 1}`);

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
				logger.success(`Course done: ${courseDisplayName(course)}`);
			} catch (error) {
				const err = error as Error;
				saveProgress(course.url, course.courseTitle, 'failed');
				logger.error(`Course failed: ${courseDisplayName(course)} — ${err.message}`);
				logMemoryUsage(`After failed course ${i + 1}`);
			}
		}

		logger.success('All courses have been processed');
	} catch (error) {
		const err = error as Error;
		logger.error(err.message);
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch((error: Error) => {
		logger.error(`Fatal error: ${error}`);
		process.exit(1);
	});
}
