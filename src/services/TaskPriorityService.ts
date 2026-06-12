import { Task } from '../models/types';

const PRIORITY_VALUES: Record<string, number> = {
	highest: 1,
	high: 2,
	medium: 3,
	low: 4,
};

const PRIORITY_FIELD_REGEX = /\[\s*priority\s*::\s*([^\]]+?)\s*\]/gi;
const PRIORITY_FIELD_STRIP_REGEX = /\s*\[\s*priority\s*::[^\]]*?\]/gi;

export function parseDataviewPriority(line: string): number | undefined {
	PRIORITY_FIELD_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = PRIORITY_FIELD_REGEX.exec(line)) !== null) {
		const value = match[1].trim().toLowerCase();
		const priority = PRIORITY_VALUES[value];
		if (priority !== undefined) {
			return priority;
		}
	}
	return undefined;
}

export function stripDataviewPriorityFields(line: string): string {
	return line
		.replace(PRIORITY_FIELD_STRIP_REGEX, '')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();
}

export function sortTasksByPriority(tasks: Task[]): Task[] {
	return tasks
		.map((task, index) => ({ task, index }))
		.sort((a, b) => {
			const pa = a.task.priority ?? 99;
			const pb = b.task.priority ?? 99;
			if (pa !== pb) return pa - pb;
			return a.index - b.index;
		})
		.map(item => item.task);
}
