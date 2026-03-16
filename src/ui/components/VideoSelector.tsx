import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { bus } from '../AppEventBus';
import type { PendingPrompt } from '../useAppState';

interface Choice {
	name: string;
	value: unknown;
	isHeader?: boolean;
}

interface Props {
	prompt: PendingPrompt;
}

const PAGE_SIZE = 16;

export function VideoSelector({ prompt }: Props): React.ReactElement {
	const choices = prompt.choices ?? [];
	const [cursor, setCursor] = useState(0);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [scrollOffset, setScrollOffset] = useState(0);
	const { isRawModeSupported } = useStdin();

	useInput((_input, key) => {
		if (key.upArrow) {
			const next = Math.max(0, cursor - 1);
			setCursor(next);
			if (next < scrollOffset) setScrollOffset(next);
		} else if (key.downArrow) {
			const next = Math.min(choices.length - 1, cursor + 1);
			setCursor(next);
			if (next >= scrollOffset + PAGE_SIZE) setScrollOffset(next - PAGE_SIZE + 1);
		} else if (key.return) {
			const values = Array.from(selected).map((i) => choices[i].value);
			bus.emit('prompt:answer', { promptId: prompt.promptId, answer: values });
		} else if (_input === ' ') {
			const choice = choices[cursor];
			if (!choice || choice.isHeader) return;
			const next = new Set(selected);
			if (next.has(cursor)) {
				next.delete(cursor);
			} else {
				next.add(cursor);
			}
			setSelected(next);
		} else if (_input === 'a' || _input === 'A') {
			const allIndexes = choices
				.map((c, i) => (c.isHeader ? -1 : i))
				.filter((i) => i >= 0);
			setSelected(new Set(allIndexes));
		} else if (_input === 'n' || _input === 'N') {
			setSelected(new Set());
		}
	}, { isActive: isRawModeSupported ?? false });

	const visible = choices.slice(scrollOffset, scrollOffset + PAGE_SIZE);

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Header */}
			<Box
				borderStyle="round"
				borderColor="#FF8C00"
				paddingX={2}
				paddingY={1}
				marginBottom={1}
			>
				<Box flexDirection="column">
					<Text bold color="#FFD700">
						{' Select Videos to Download'}
					</Text>
					<Box marginTop={1} gap={3}>
						<Text color="#888888">{'↑↓ navigate'}</Text>
						<Text color="#888888">{'space toggle'}</Text>
						<Text color="#888888">{'a select all'}</Text>
						<Text color="#888888">{'n deselect all'}</Text>
						<Text color="#4CAF50" bold>{'enter confirm'}</Text>
					</Box>
					<Box marginTop={1} gap={1}>
						<Text color="#666666">
							{`${selected.size} video${selected.size !== 1 ? 's' : ''} selected`}
						</Text>
					</Box>
				</Box>
			</Box>

			{/* List */}
			<Box flexDirection="column" paddingLeft={2}>
				{visible.map((choice: Choice, visibleIndex) => {
					const actualIndex = scrollOffset + visibleIndex;
					const isActive = actualIndex === cursor;
					const isSelected = selected.has(actualIndex);

					if (choice.isHeader) {
						return (
							<Box key={actualIndex} gap={1} marginTop={visibleIndex > 0 ? 1 : 0}>
								<Text color={isActive ? '#FFD700' : '#FF8C00'} bold>
									{isActive ? '▸' : ' '}
								</Text>
								<Text color={isActive ? '#FFD700' : '#FF8C00'} bold>
									{choice.name}
								</Text>
							</Box>
						);
					}

					return (
						<Box key={actualIndex} gap={1}>
							<Text color={isActive ? '#FFD700' : '#555555'}>
								{isActive ? '▸' : ' '}
							</Text>
							<Text color={isSelected ? '#4CAF50' : isActive ? '#FF8C00' : '#888888'}>
								{isSelected ? '◉' : '○'}
							</Text>
							<Text
								color={isSelected ? '#4CAF50' : isActive ? 'white' : '#888888'}
								bold={isActive}
							>
								{choice.name}
							</Text>
						</Box>
					);
				})}

				{/* Scroll indicator */}
				{choices.length > PAGE_SIZE && (
					<Box marginTop={1} gap={1}>
						<Text color="#555555">
							{`  ${scrollOffset + 1}–${Math.min(scrollOffset + PAGE_SIZE, choices.length)} of ${choices.length}`}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
}
