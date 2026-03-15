import * as cheerio from 'cheerio';
import * as cliProgress from 'cli-progress';
import inquirer from 'inquirer';
import puppeteer, { type HTTPRequest, type Page } from 'puppeteer';
import type { Credentials } from '../auth';
import domestikaAuth from '../auth';
import { isVideoCompleted } from '../csv/progress';
import { downloadVideo } from '../downloader/downloader';
import type { DownloadOption, Unit, VideoData, VideoSelection } from '../types';
import { debugLog, logMemoryUsage, setActiveMultiBar } from '../utils/debug';
import { logger } from '../utils/logger';
import { getEnvInt } from '../utils/env';
import { sanitizeTitle } from '../utils/strings';
import { loadCourseMetadata, saveCourseMetadata } from './cache';
import { fetchUnitVideoData } from './video-data';

interface DownloadTask {
	video: VideoData;
	unit: Unit;
	videoIndex: number;
}

async function downloadSpecificVideos(
	allVideos: Unit[],
	courseUrl: string,
	courseTitle: string | null,
	subtitleLangs: string[] | null,
	completedVideos: Set<string>
): Promise<void> {
	const videoChoices = allVideos.flatMap((unit) => {
		const unitHeader = {
			name: `Unit ${unit.unitNumber}: ${unit.title}`,
			value: `unit_${unit.unitNumber}`,
			checked: false,
		};

		const unitVideos = unit.videoData.map((video, index) => ({
			name: `    ${index + 1}. ${video.title}`,
			value: {
				unit: unit,
				videoData: video,
				index: index + 1,
			},
			short: video.title,
		}));

		return [unitHeader, ...unitVideos];
	});

	const selectedVideos = await inquirer.prompt<{ videosToDownload: (string | VideoSelection)[] }>(
		[
			{
				type: 'checkbox',
				name: 'videosToDownload',
				message: 'Select complete units or specific videos:',
				choices: videoChoices,
				pageSize: 20,
				loop: false,
			},
		]
	);

	for (const selection of selectedVideos.videosToDownload) {
		if (typeof selection === 'string' && selection.startsWith('unit_')) {
			const unitNumber = Number.parseInt(selection.split('_')[1], 10);
			const unit = allVideos.find((u) => u.unitNumber === unitNumber);

			if (unit) {
				for (let i = 0; i < unit.videoData.length; i++) {
					const videoIndex = i + 1;
					const video = unit.videoData[i];
					if (
						await isVideoCompleted(
							courseUrl,
							unit.unitNumber,
							videoIndex,
							completedVideos,
							courseTitle,
							unit.title,
							video.title,
							video.section
						)
					) {
						logger.skip(`Already downloaded: ${video.title}`);
						continue;
					}
					await downloadVideo(
						video,
						courseTitle,
						unit.title,
						videoIndex,
						subtitleLangs,
						unit.unitNumber,
						undefined,
						courseUrl,
						completedVideos
					);
				}
			}
		} else if (typeof selection === 'object' && 'videoData' in selection) {
			if (
				await isVideoCompleted(
					courseUrl,
					selection.unit.unitNumber,
					selection.index,
					completedVideos,
					courseTitle,
					selection.unit.title,
					selection.videoData.title,
					selection.videoData.section
				)
			) {
				logger.skip(`Already downloaded: ${selection.videoData.title}`);
			} else {
				await downloadVideo(
					selection.videoData,
					courseTitle,
					selection.unit.title,
					selection.index,
					subtitleLangs,
					selection.unit.unitNumber,
					undefined,
					courseUrl,
					completedVideos
				);
			}
		}
	}
}

function getMultiSectionUnits($: cheerio.CheerioAPI) {
	return $('h4.h2.unit-item__title a');
}

function getSingleSectionUnits($: cheerio.CheerioAPI) {
	return $('h5.h3.unit-subitem__title a');
}

async function getVideoFilesFromMultiSection(
	units: ReturnType<typeof getMultiSectionUnits>,
	$: cheerio.CheerioAPI,
	page: Page
): Promise<Unit[]> {
	const videos: Unit[] = [];
	for (let i = 0; i < units.length; i++) {
		const unitHref = $(units[i]).attr('href');
		if (!unitHref) {
			throw new Error('Cannot download suitable unit link.');
		}

		const videoData = await fetchUnitVideoData(unitHref, page);
		videos.push({
			title: sanitizeTitle($(units[i]).text()),
			videoData,
			unitNumber: i + 1,
		});
	}
	return videos;
}

async function getVideoFilesFromSingleSection(
	units: ReturnType<typeof getSingleSectionUnits>,
	$: cheerio.CheerioAPI,
	page: Page
): Promise<Unit[]> {
	const unitHref = $(units[0]).attr('href');
	if (!unitHref) {
		throw new Error('Cannot download suitable unit link.');
	}

	const videoData = await fetchUnitVideoData(unitHref, page);
	return videoData.map((video, index) => ({
		title: video.title,
		videoData: [video],
		unitNumber: index + 1,
	}));
}

async function closeBrowser(
	page: Page | null,
	requestHandler: ((req: HTTPRequest) => void) | null,
	browser: Awaited<ReturnType<typeof puppeteer.launch>> | null
): Promise<void> {
	if (page && requestHandler) {
		page.off('request', requestHandler);
		await page.setRequestInterception(false);
	}
	if (page) await page.close();
	if (browser) await browser.close();
}

async function promptCookieRefreshAndRetry(
	courseUrl: string,
	subtitleLangs: string[] | null,
	downloadOption: DownloadOption,
	courseTitle: string | null,
	completedVideos: Set<string>
): Promise<void> {
	const answer = await inquirer.prompt<{ updateCookies: boolean }>([
		{
			type: 'confirm',
			name: 'updateCookies',
			message: 'Do you want to update the cookies?',
			default: true,
		},
	]);

	if (answer.updateCookies) {
		await domestikaAuth.promptForCredentials(true);
		return scrapeSite(
			courseUrl,
			subtitleLangs,
			await domestikaAuth.getCookies(),
			downloadOption,
			courseTitle,
			completedVideos
		);
	}
}


export async function scrapeSite(
	courseUrl: string,
	subtitleLangs: string[] | null,
	auth: Credentials,
	downloadOption: DownloadOption,
	courseTitle: string | null,
	completedVideos: Set<string> = new Set<string>()
): Promise<void> {
	// Check cache before starting browser
	const cachedMetadata = loadCourseMetadata(courseUrl);
	let allVideos: Unit[] = [];
	let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
	let page: Page | null = null;
	let requestHandler: ((req: HTTPRequest) => void) | null = null;

	if (cachedMetadata) {
		debugLog(`[CACHE] Using cached metadata for course: ${courseUrl}`);
		allVideos = cachedMetadata;
		logger.info(`Course: ${courseTitle}`);
		logger.info(`${allVideos.length} units loaded from cache`);
	} else {
		debugLog(`[CACHE] Cache miss or expired for course: ${courseUrl}`);

		browser = await puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		});
		const context = browser.defaultBrowserContext();
		await context.setCookie(...auth.cookies);
		page = await browser.newPage();
		page.setDefaultNavigationTimeout(0);

		await page.setRequestInterception(true);
		requestHandler = (req: HTTPRequest) => {
			if (
				req.resourceType() === 'stylesheet' ||
				req.resourceType() === 'font' ||
				req.resourceType() === 'image'
			) {
				req.abort();
			} else {
				req.continue();
			}
		};
		page.on('request', requestHandler);

		await page.goto(courseUrl);
		const html = await page.content();
		const $ = cheerio.load(html);

		logger.step('Analyzing site...');

		const multiUnits = getMultiSectionUnits($);
		logger.info(`Found ${multiUnits.length} multi-section units`);

		const singleUnits = getSingleSectionUnits($);
		logger.info(`Found ${singleUnits.length} single-section units`);


		if (multiUnits.length > 0) {
			allVideos = await getVideoFilesFromMultiSection(multiUnits, $, page);
		} else if (singleUnits.length > 0) {
			allVideos = await getVideoFilesFromSingleSection(singleUnits, $, page);
		} else {
			await closeBrowser(page, requestHandler, browser);
			logger.error('No videos found. This may be due to invalid cookies.');
			await promptCookieRefreshAndRetry(
				courseUrl,
				subtitleLangs,
				downloadOption,
				courseTitle,
				completedVideos
			);
			throw new Error('Cannot download videos without valid cookies.');
		}

		logger.info(`Course: ${courseTitle}`);
		logger.info(`${allVideos.length} units detected`);

		saveCourseMetadata(courseUrl, allVideos, courseTitle);
		debugLog(`[CACHE] Saved metadata to cache for course: ${courseUrl}`);

		await closeBrowser(page, requestHandler, browser);
	}

	if (downloadOption === 'specific') {
		await downloadSpecificVideos(allVideos, courseUrl, courseTitle, subtitleLangs, completedVideos);
	} else {
		await downloadAllVideos(allVideos, courseUrl, courseTitle, subtitleLangs, completedVideos, downloadOption);
	}
}

async function downloadAllVideos(
	allVideos: Unit[],
	courseUrl: string,
	courseTitle: string | null,
	subtitleLangs: string[] | null,
	completedVideos: Set<string>,
	downloadOption: DownloadOption
): Promise<void> {
	logger.step('Downloading entire course...');
	let downloadedCount = 0;
	let skippedCount = 0;

	const multiBar = new cliProgress.MultiBar({
		format: '  {title} |{bar}| {percentage}% | ETA: {eta}s',
		barCompleteChar: '\u2588',
		barIncompleteChar: '\u2591',
		hideCursor: true,
		clearOnComplete: true,
		stopOnComplete: true,
		linewrap: false,
		barsize: 40,
		forceRedraw: true,
		noTTYOutput: false,
		notTTYSchedule: 2000,
	});

	setActiveMultiBar(multiBar);

	// Build queue, counting skips in a single pass
	const downloadQueue: DownloadTask[] = [];

	for (const unit of allVideos) {
		for (let i = 0; i < unit.videoData.length; i++) {
			const video = unit.videoData[i];
			if (!video?.playbackURL) {
				logger.error(`Invalid video data for ${unit.title} #${i}`, multiBar);
				continue;
			}

			const videoIndex = i + 1;
			if (
				await isVideoCompleted(
					courseUrl,
					unit.unitNumber,
					videoIndex,
					completedVideos,
					courseTitle,
					unit.title,
					video.title,
					video.section
				)
			) {
				skippedCount++;
				continue;
			}

			downloadQueue.push({ video, unit, videoIndex });
		}
	}

	if (skippedCount > 0) {
		logger.skip(`${skippedCount} already downloaded video(s) skipped`);
	}

	const MAX_CONCURRENT_DOWNLOADS = getEnvInt('MAX_CONCURRENT_DOWNLOADS', 2);

	debugLog(
		`[DOWNLOAD] Starting download queue with ${downloadQueue.length} videos, max concurrency: ${MAX_CONCURRENT_DOWNLOADS}`
	);
	logMemoryUsage('Before starting downloads');

	let processedCount = 0;
	const activeDownloads: Promise<void>[] = [];

	for (const task of downloadQueue) {
		while (activeDownloads.length >= MAX_CONCURRENT_DOWNLOADS) {
			await Promise.race(activeDownloads);
		}

		const downloadPromise = (async (): Promise<void> => {
			try {
				await downloadVideo(
					task.video,
					courseTitle,
					task.unit.title,
					task.videoIndex,
					subtitleLangs,
					task.unit.unitNumber,
					multiBar,
					courseUrl,
					completedVideos
				);
				downloadedCount++;
				processedCount++;

				if (processedCount % 10 === 0) {
					logMemoryUsage(`After ${processedCount} videos processed`);
					debugLog(
						`[DOWNLOAD] Progress: ${processedCount}/${downloadQueue.length} videos processed, ${downloadedCount} downloaded, ${completedVideos.size} in completed set`
					);
				}
			} catch (error) {
				const err = error as Error;
				logger.error(`Error in video ${task.video.title}: ${err.message}`, multiBar);
				processedCount++;
			}
		})();

		activeDownloads.push(downloadPromise);
		downloadPromise.finally(() => {
			const idx = activeDownloads.indexOf(downloadPromise);
			if (idx !== -1) activeDownloads.splice(idx, 1);
		});
	}

	await Promise.all(activeDownloads);

	multiBar.stop();
	setActiveMultiBar(null);
	logMemoryUsage('After all downloads completed');

	logger.success(`Download summary: ${downloadedCount} new, ${skippedCount} skipped`);

	if (downloadedCount === 0 && skippedCount === 0) {
		logger.error('Could not download any videos. This may be due to invalid cookies.');
		await promptCookieRefreshAndRetry(
			courseUrl,
			subtitleLangs,
			downloadOption,
			courseTitle,
			completedVideos
		);
	}
}
