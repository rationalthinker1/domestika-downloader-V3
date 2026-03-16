import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import TextInput from 'ink-text-input';
import { bus } from '../AppEventBus';
import type { PendingPrompt } from '../useAppState';

interface Props {
	prompt: PendingPrompt;
}

export function AuthPrompt({ prompt }: Props): React.ReactElement {
	const [value, setValue] = useState('');

	const handleSubmit = (submitted: string) => {
		bus.emit('prompt:answer', { promptId: prompt.promptId, answer: submitted });
		setValue('');
	};

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Instructions panel */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="#FF8C00"
				paddingX={2}
				paddingY={1}
				marginBottom={1}
			>
				<Text bold color="#FFD700">
					{'  Authentication Required'}
				</Text>
				<Box flexDirection="column" marginTop={1}>
					<Text color="gray">{'  ① Log in to Domestika in your browser'}</Text>
					<Text color="gray">{'  ② Open Developer Tools  →  F12'}</Text>
					<Text color="gray">{'  ③ Application  →  Cookies  →  www.domestika.org'}</Text>
					<Text color="gray">{'  ④ Copy: _domestika_session'}</Text>
					<Text color="gray">{'  ⑤ Copy: _credentials'}</Text>
				</Box>
			</Box>

			{/* Input field */}
			<Box
				borderStyle="round"
				borderColor="#FF6B35"
				paddingX={2}
				paddingY={1}
			>
				<Box flexDirection="column" gap={1}>
					<Text bold color="#FF8C00">
						{prompt.message}
					</Text>
					<Box gap={1}>
						<Text color="#FFD700">{'›'}</Text>
						<TextInput
							value={value}
							onChange={setValue}
							onSubmit={handleSubmit}
							mask={prompt.mask ? '●' : undefined}
							placeholder="Paste cookie value here..."
						/>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}

interface ConfirmProps {
	prompt: PendingPrompt;
}

export function ConfirmPrompt({ prompt }: ConfirmProps): React.ReactElement {
	const { isRawModeSupported } = useStdin();
	useInput((input, key) => {
		if (key.return || input.toLowerCase() === 'y') {
			bus.emit('prompt:answer', { promptId: prompt.promptId, answer: true });
		} else if (input.toLowerCase() === 'n') {
			bus.emit('prompt:answer', { promptId: prompt.promptId, answer: false });
		}
	}, { isActive: isRawModeSupported ?? false });

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor="#FF8C00"
			paddingX={2}
			paddingY={1}
			marginY={1}
		>
			<Text bold color="#FFD700">
				{'  '}
				{prompt.message}
			</Text>
			<Box marginTop={1} gap={2}>
				<Text color="#4CAF50" bold>
					{'[Y] Yes'}
				</Text>
				<Text color="#FF6B6B">{'[N] No'}</Text>
			</Box>
		</Box>
	);
}
