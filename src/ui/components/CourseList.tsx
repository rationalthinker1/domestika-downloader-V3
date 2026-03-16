import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { CourseRow } from '../useAppState';
import type { CourseStatus } from '../AppEventBus';

interface Props {
	courses: CourseRow[];
	scraping: boolean;
	scrapeUnitCount: number;
}

const STATUS_CONFIG: Record<CourseStatus, { icon: string; color: string; label: string }> = {
	pending:    { icon: '○', color: '#666666', label: 'PENDING'    },
	processing: { icon: '◐', color: '#FFD700', label: 'PROCESSING' },
	done:       { icon: '✔', color: '#4CAF50', label: 'DONE'       },
	failed:     { icon: '✖', color: '#FF4D4D', label: 'FAILED'     },
};

function StatusBadge({ status }: { status: CourseStatus }): React.ReactElement {
	const cfg = STATUS_CONFIG[status];
	return (
		<Box gap={1}>
			{status === 'processing' ? (
				<Text color={cfg.color}>
					<Spinner type="dots" />
				</Text>
			) : (
				<Text color={cfg.color}>{cfg.icon}</Text>
			)}
			<Text color={cfg.color} bold>
				{cfg.label}
			</Text>
		</Box>
	);
}

export function CourseList({ courses, scraping, scrapeUnitCount }: Props): React.ReactElement {
	return (
		<Box flexDirection="column" marginY={1}>
			{/* Section header */}
			<Box marginBottom={1}>
				<Text color="#FF8C00" bold>
					{'  ┌─ '}
				</Text>
				<Text bold color="#FFD700">
					{'COURSES'}
				</Text>
				<Text color="#FF8C00">
					{` ─── ${courses.length} queued`}
				</Text>
			</Box>

			{courses.map((course, i) => (
				<Box key={course.url} flexDirection="column">
					<Box gap={2} paddingLeft={4}>
						<Text color="#666666">{`${i + 1}.`}</Text>
						<Text bold color="white">
							{course.title || course.url}
						</Text>
						<StatusBadge status={course.status} />
					</Box>

					{/* Scraping indicator for active course */}
					{course.status === 'processing' && scraping && (
						<Box paddingLeft={8} gap={1}>
							<Text color="#FF8C00">
								<Spinner type="dots2" />
							</Text>
							<Text color="#FF8C00">{'Analyzing course structure'}</Text>
							{scrapeUnitCount > 0 && (
								<Text color="#FFD700">{`— ${scrapeUnitCount} units found`}</Text>
							)}
						</Box>
					)}
				</Box>
			))}

			{courses.length === 0 && (
				<Box paddingLeft={4}>
					<Text color="#666666">{'Loading courses...'}</Text>
				</Box>
			)}
		</Box>
	);
}
