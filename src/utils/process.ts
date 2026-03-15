import { spawn } from 'node:child_process';

/**
 * Runs a command as a child process and resolves with stdout/stderr on exit code 0.
 * Rejects with an error message containing stderr (or stdout) on non-zero exit.
 */
export function spawnPromise(
	command: string,
	args: string[]
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { shell: false });

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString();
		});

		child.on('close', (code: number | null) => {
			if (code === 0) {
				resolve({ stdout, stderr });
			} else {
				reject(new Error(`Process exited with code ${code}. ${stderr || stdout}`));
			}
		});

		child.on('error', (error: Error) => {
			reject(error);
		});
	});
}
