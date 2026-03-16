import { bus } from '../AppEventBus';
import type { PromptCheckboxItem } from '../AppEventBus';

let promptCounter = 0;

function nextId(): string {
	return `prompt-${++promptCounter}`;
}

function waitForAnswer<T>(promptId: string): Promise<T> {
	return new Promise((resolve) => {
		const handler = (data: { promptId: string; answer: unknown }) => {
			if (data.promptId === promptId) {
				bus.off('prompt:answer', handler);
				resolve(data.answer as T);
			}
		};
		bus.on('prompt:answer', handler);
	});
}

export async function promptTextInput(params: {
	field: string;
	message: string;
	mask?: boolean;
}): Promise<string> {
	const promptId = nextId();
	bus.emit('prompt:request', { promptId, ...params });
	return waitForAnswer<string>(promptId);
}

export async function promptConfirm(message: string): Promise<boolean> {
	const promptId = nextId();
	bus.emit('prompt:confirm', { promptId, message });
	return waitForAnswer<boolean>(promptId);
}

export async function promptCheckbox<T>(params: {
	message: string;
	choices: PromptCheckboxItem[];
}): Promise<T[]> {
	const promptId = nextId();
	bus.emit('prompt:checkbox', { promptId, ...params });
	return waitForAnswer<T[]>(promptId);
}
