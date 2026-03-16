import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { DownloadRow } from '../useAppState';
import type { LogEvent } from '../AppEventBus';

const BAR_WIDTH = 28;

function ProgressBar({ percent }: { percent: number }): React.ReactElement {
	const filled = Math.round((percent / 100) * BAR_WIDTH);
	const empty = BAR_WIDTH - filled;
	const filledStr = '█'.repeat(Math.max(0, filled));
	const emptyStr = '░'.repeat(Math.max(0, empty));

	const color =
		percent >= 100
			? '#4CAF50'
			: percent >= 66
			? '#FF8C00'
			: percent >= 33
			? '#FFB300'
			: '#FF4D4D';

	return (
		<Text color={color}>
			{filledStr}
			<Text color="#333333">{emptyStr}</Text>
		</Text>
	);
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str.padEnd(maxLen);
	return `${str.slice(0, maxLen - 1)}…`;
}

interface LogFeedProps {
	logs: LogEvent[];
	maxLines?: number;
}

const LOG_COLORS: Record<string, string> = {
	info:    '#888888',
	success: '#4CAF50',
	warn:    '#FFB300',
	error:   '#FF4D4D',
	skip:    '#666666',
	step:    '#FF8C00',
	debug:   '#444444',
};

const LOG_ICONS: Record<string, string> = {
	info:    'ℹ',
	success: '✔',
	warn:    '⚠',
	error:   '✖',
	skip:    '↷',
	step:    '›',
	debug:   '·',
};

export function LogFeed({ logs, maxLines = 12 }: LogFeedProps): React.ReactElement {
	const visibleLogs = logs.slice(-maxLines);

	return (
		<Box flexDirection="column">
			{visibleLogs.map((log, i) => {
				const color = LOG_COLORS[log.level] ?? '#888888';
				const icon = LOG_ICONS[log.level] ?? '·';
				return (
					<Box key={i} gap={1}>
						<Text color={color}>{icon}</Text>
						<Text color={color} wrap="truncate-end">
							{log.message}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}

interface Props {
	downloads: Map<string, DownloadRow>;
	logs: LogEvent[];
}

export function DownloadDashboard({ downloads, logs }: Props): React.ReactElement {
	const rows = useMemo(() => Array.from(downloads.values()), [downloads]);
	const activeRows = rows.filter((r) => r.status === 'downloading');
	const doneCount = rows.filter((r) => r.status === 'done').length;
	const totalCount = rows.length;

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Stats bar */}
			<Box gap={3} paddingLeft={2} marginBottom={1}>
				<Box gap={1}>
					<Text color="#FF8C00" bold>{'↓'}</Text>
					<Text color="white" bold>{'DOWNLOADING'}</Text>
				</Box>
				<Box gap={1}>
					<Text color="#666666">{'Active:'}</Text>
					<Text color="#FFD700" bold>{String(activeRows.length)}</Text>
				</Box>
				<Box gap={1}>
					<Text color="#666666">{'Done:'}</Text>
					<Text color="#4CAF50" bold>{String(doneCount)}</Text>
				</Box>
				<Box gap={1}>
					<Text color="#666666">{'Total:'}</Text>
					<Text color="white">{String(totalCount)}</Text>
				</Box>
			</Box>

			{/* Two-panel layout */}
			<Box gap={3}>
				{/* Left: progress bars */}
				<Box flexDirection="column" width={56}>
					<Box marginBottom={1} paddingLeft={1}>
						<Text color="#FF8C00">{'┌─'}</Text>
						<Text color="#FFD700" bold>{' ACTIVE DOWNLOADS '}</Text>
						<Text color="#FF8C00">{'─'.repeat(24)}</Text>
					</Box>

					{activeRows.length === 0 && doneCount === 0 && (
						<Box paddingLeft={4}>
							<Text color="#666666">{'Preparing downloads...'}</Text>
						</Box>
					)}

					{activeRows.map((row) => (
						<Box key={row.videoId} flexDirection="column" paddingLeft={2} marginBottom={1}>
							<Box gap={1}>
								<Text color="#FF6B35">{'▸'}</Text>
								<Text color="white" bold wrap="truncate-end">
									{truncate(row.title, 46)}
								</Text>
							</Box>
							<Box paddingLeft={4} gap={1}>
								<ProgressBar percent={row.percent} />
								<Text color="#666666">{`${Math.round(row.percent)}%`}</Text>
							</Box>
						</Box>
					))}

					{/* Recently completed (last 3) */}
					{doneCount > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Box paddingLeft={1} marginBottom={0}>
								<Text color="#333333">{'└─ recently done'}</Text>
							</Box>
							{rows
								.filter((r) => r.status === 'done')
								.slice(-3)
								.map((row) => (
									<Box key={`done-${row.videoId}`} paddingLeft={4} gap={1}>
										<Text color="#4CAF50">{'✔'}</Text>
										<Text color="#4CAF50" dimColor wrap="truncate-end">
											{truncate(row.title, 46)}
										</Text>
									</Box>
								))}
						</Box>
					)}
				</Box>

				{/* Right: log feed */}
				<Box flexDirection="column" width={50}>
					<Box marginBottom={1} paddingLeft={1}>
						<Text color="#555555">{'┌─'}</Text>
						<Text color="#888888" bold>{' LOG '}</Text>
						<Text color="#555555">{'─'.repeat(39)}</Text>
					</Box>
					<Box paddingLeft={2}>
						<LogFeed logs={logs} maxLines={14} />
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
