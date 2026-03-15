import * as fs from 'node:fs';
import inquirer from 'inquirer';
import 'dotenv/config';
import domestikaAuth from './auth';
import { readInputCSV } from './csv/input';
import { loadProgress, saveProgress } from './csv/progress';
import { scrapeSite } from './scraper/scraper';
import type { CourseToProcess, DownloadOption, InquirerAnswers } from './types';
import { logMemoryUsage } from './utils/debug';
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

	console.log(`\n📋 Found ${csvCourses.length} courses in input.csv`);
	return csvCourses.map((course) =>
		toCourseToProcess(
			course.url,
			parseSubtitleLanguages(course.subtitles),
			course.downloadOption || 'all'
		)
	);
}

function resolveCoursesFromArgs(): CourseToProcess[] {
	const args = process.argv.slice(2);
	const rawUrls = args[0];
	const subtitleLangs = parseSubtitleLanguages(args[1] ?? null);
	const downloadOption = (args[2] ?? 'all') as DownloadOption;

	const urls = rawUrls.trim().split(' ');
	if (!urls.every(isValidDomestikaUrl)) {
		throw new Error('Please provide valid Domestika course URLs');
	}

	console.log('Using command-line arguments:');
	console.log(`  Course URLs: ${rawUrls}`);
	console.log(`  Subtitles: ${subtitleLangs ? subtitleLangs.join(', ') : 'None'}`);
	console.log(`  Download Option: ${downloadOption}`);

	return urls.map((url) => toCourseToProcess(url, subtitleLangs, downloadOption));
}

async function resolveCoursesInteractively(): Promise<CourseToProcess[]> {
	const answers = await inquirer.prompt<InquirerAnswers>([
		{
			type: 'input' as const,
			name: 'courseUrls',
			message: 'Course URLs (separated by spaces):',
			validate: (input: string) => {
				const urls = input.trim().split(' ');
				return urls.every(isValidDomestikaUrl) || 'Please enter valid Domestika course URLs';
			},
		},
		{
			type: 'checkbox' as const,
			name: 'subtitles',
			message: 'Select subtitle languages (space to select, enter to confirm):',
			choices: [
				{ name: 'Spanish', value: 'es' },
				{ name: 'English', value: 'en' },
				{ name: 'Portuguese', value: 'pt' },
				{ name: 'French', value: 'fr' },
				{ name: 'German', value: 'de' },
				{ name: 'Italian', value: 'it' },
			],
		},
		{
			type: 'list' as const,
			name: 'downloadOption',
			message: 'What do you want to download?',
			choices: [
				{ name: 'Entire course', value: 'all' },
				{ name: 'Specific videos', value: 'specific' },
			],
		},
	]);

	const urls = answers.courseUrls.trim().split(' ');
	const subtitleLangs = answers.subtitles?.length ? answers.subtitles : null;

	return urls.map((url) => toCourseToProcess(url, subtitleLangs, answers.downloadOption));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
	try {
		console.log('Starting Domestika Downloader...');

		const auth = await domestikaAuth.getCookies();

		let coursesToProcess: CourseToProcess[];

		const fromCsv = resolveCoursesFromCsv();
		if (fromCsv.length > 0) {
			coursesToProcess = fromCsv;
		} else if (process.argv.length > 2) {
			coursesToProcess = resolveCoursesFromArgs();
		} else {
			coursesToProcess = await resolveCoursesInteractively();
		}

		const n3u8dlPath = getN3u8DLPath();
		if (!fs.existsSync(n3u8dlPath)) {
			throw new Error(
				`${n3u8dlPath} not found! Download the binary here: https://github.com/nilaoda/N_m3u8DL-RE/releases`
			);
		}

		if (coursesToProcess.length === 0) {
			console.log('No courses to process.');
			return;
		}

		logMemoryUsage('Before loadProgress');
		const completedVideos = loadProgress();
		logMemoryUsage(`After loadProgress (${completedVideos.size} videos in set)`);

		console.log(`\n${coursesToProcess.length} course(s) will be processed:`);
		for (const [i, course] of coursesToProcess.entries()) {
			console.log(`${i + 1}. ${course.url} (${courseDisplayName(course)})`);
		}

		for (const [i, course] of coursesToProcess.entries()) {
			console.log(
				`\n📚 Processing course ${i + 1} of ${coursesToProcess.length}: ${courseDisplayName(course)}`
			);
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
				console.log(`✅ Course processing completed: ${courseDisplayName(course)}`);
			} catch (error) {
				const err = error as Error;
				saveProgress(course.url, course.courseTitle, 'failed');
				console.error(`❌ Course failed: ${courseDisplayName(course)} - ${err.message}`);
				logMemoryUsage(`After failed course ${i + 1}`);
			}
		}

		console.log('\n✅ All courses have been processed');
	} catch (error) {
		const err = error as Error;
		console.error('Error:', err.message);
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch((error: Error) => {
		console.error('Fatal error:', error);
		process.exit(1);
	});
}
