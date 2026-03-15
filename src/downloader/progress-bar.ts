import { spawn } from 'node:child_process';
import * as cliProgress from 'cli-progress';
import { appendCapped, truncateWithEllipsis } from '../utils/strings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TITLE_DISPLAY_WIDTH = 30;
const OUTPUT_BUFFER_LIMIT = 100 * 1024; // 100 KB

// Compiled once at module level — not recreated on every line of output
const PROGRESS_PATTERNS = [
	/(\d+\.?\d*)%/g,                   // bare percentage: "50.0%"
	/\[(\d+\.?\d*)%\]/g,               // bracketed: "[50%]"
	/segment\s+(\d+)\/(\d+)/gi,        // segment count: "Segment 10/20"
	/downloaded\s+(\d+\.?\d*)%/gi,     // "Downloaded 50%"
] as const;

const COMPLETION_MARKERS = ['Download completed', 'Merging', 'Done', 'Successfully'] as const;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Extracts a 0–100 progress value from a single output line. Returns null if none found. */
export function extractProgressFromLine(line: string): number | null {
	for (const pattern of PROGRESS_PATTERNS) {
		pattern.lastIndex = 0; // reset stateful global regex
		const match = pattern.exec(line);
		if (!match) continue;

		const value =
			match.length === 3
				? (Number.parseInt(match[1], 10) / Number.parseInt(match[2], 10)) * 100
				: Number.parseFloat(match[1]);

		if (value > 0 && value <= 100) return value;
	}
	return null;
}

function formatDisplayTitle(title: string): string {
	return truncateWithEllipsis(title, TITLE_DISPLAY_WIDTH).padEnd(TITLE_DISPLAY_WIDTH);
}

// ---------------------------------------------------------------------------
// Progress bar management
// ---------------------------------------------------------------------------

type AnyBar = cliProgress.SingleBar | ReturnType<cliProgress.MultiBar['create']>;

function createBar(title: string, multiBar?: cliProgress.MultiBar): AnyBar {
	const displayTitle = formatDisplayTitle(title);
	if (multiBar) {
		return multiBar.create(100, 0, { title: displayTitle });
	}
	return new cliProgress.SingleBar({
		format: `  ${displayTitle} |{bar}| {percentage}% | ETA: {eta}s`,
		barCompleteChar: '\u2588',
		barIncompleteChar: '\u2591',
		hideCursor: true,
		clearOnComplete: true,
	});
}

function updateBar(bar: AnyBar, value: number, displayTitle: string, multiBar?: cliProgress.MultiBar): void {
	if (multiBar) {
		(bar as ReturnType<cliProgress.MultiBar['create']>).update(value, { title: displayTitle });
	} else {
		(bar as cliProgress.SingleBar).update(value);
	}
}

function teardownBar(bar: AnyBar, multiBar?: cliProgress.MultiBar): void {
	if (multiBar) {
		multiBar.remove(bar as ReturnType<cliProgress.MultiBar['create']>);
	} else {
		(bar as cliProgress.SingleBar).stop();
	}
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function spawnWithProgress(
	command: string,
	args: string[],
	videoTitle: string,
	multiBar?: cliProgress.MultiBar
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const displayTitle = formatDisplayTitle(videoTitle);
		const bar = createBar(videoTitle, multiBar);

		const proc = spawn(command, args, { cwd: process.cwd(), shell: false });

		let stdout = '';
		let stderr = '';
		let lineBuffer = '';
		let barStarted = false;
		let lastProgress = 0;

		const handleProgressLine = (line: string): void => {
			const progress = extractProgressFromLine(line);

			if (progress !== null) {
				if (!barStarted) {
					barStarted = true;
					if (!multiBar) (bar as cliProgress.SingleBar).start(100, 0);
				}
				const rounded = Math.min(100, Math.max(0, Math.round(progress)));
				if (rounded !== lastProgress) {
					updateBar(bar, rounded, displayTitle, multiBar);
					lastProgress = rounded;
				}
				return;
			}

			if (barStarted && COMPLETION_MARKERS.some((m) => line.includes(m))) {
				updateBar(bar, 100, displayTitle, multiBar);
			}
		};

		const handleOutputChunk = (data: Buffer): void => {
			lineBuffer += data.toString();
			const lines = lineBuffer.split('\n');
			lineBuffer = lines.pop() ?? '';
			for (const line of lines) handleProgressLine(line);
		};

		proc.stdout.on('data', (data: Buffer) => {
			stdout = appendCapped(stdout, data.toString(), OUTPUT_BUFFER_LIMIT);
			handleOutputChunk(data);
		});

		proc.stderr.on('data', (data: Buffer) => {
			stderr = appendCapped(stderr, data.toString(), OUTPUT_BUFFER_LIMIT);
			handleOutputChunk(data);
		});

		proc.on('close', (code: number | null) => {
			if (lineBuffer) handleProgressLine(lineBuffer);

			if (barStarted) {
				updateBar(bar, 100, displayTitle, multiBar);
				teardownBar(bar, multiBar);
			}

			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`Process exited with code ${code}. ${stderr}`));
			}
		});

		proc.on('error', (error: Error) => {
			if (barStarted) teardownBar(bar, multiBar);
			reject(error);
		});
	});
}
