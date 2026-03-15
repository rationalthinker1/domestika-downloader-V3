import type { Page } from 'puppeteer';
import type { VideoData } from '../types';
import { debugLog } from '../utils/debug';
import { sanitizeTitle } from '../utils/strings';

interface InitialPropsVideo {
	video: {
		playbackURL: string;
		title: string;
	};
}

interface InitialProps {
	videos?: InitialPropsVideo[];
	sectionTitle?: string;
}

export async function fetchUnitVideoData(url: string, page: Page): Promise<VideoData[]> {
	await page.goto(url);

	const initialProps = (await page.evaluate(() => {
		const globalScope = globalThis as Record<string, unknown>;
		return (
			globalScope.__INITIAL_PROPS__ ||
			(globalScope.window as { __INITIAL_PROPS__?: unknown } | undefined)?.__INITIAL_PROPS__
		);
	})) as InitialProps | null | undefined;

	const rawSection = await page
		.$eval('h2.h3.course-header-new__subtitle', (el) => el.textContent?.trim() ?? '')
		.catch(() => '');
	const sanitizedSection = sanitizeTitle(rawSection);

	if (!initialProps?.videos?.length) {
		debugLog(`[VIDEO-DATA] No videos found at ${url}`);
		return [];
	}

	return initialProps.videos.flatMap((el) => {
		if (!el?.video?.playbackURL || !el?.video?.title) return [];
		debugLog(`Video found: ${el.video.title}`);
		return [{
			playbackURL: el.video.playbackURL,
			title: sanitizeTitle(el.video.title),
			section: sanitizedSection
		}];
	});
}
