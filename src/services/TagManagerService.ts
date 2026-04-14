import { App, TFile } from 'obsidian';
import { QuadrantCode, Task, PluginSettings, PriorityLevel } from '../models/types';

export class TagManagerService {
	constructor(
		private app: App,
		private getSettings: () => PluginSettings
	) {}

	/** Get the tag prefix, e.g. "T/" or "" if no namespace */
	private getPrefix(): string {
		const ns = this.getSettings().tagNamespace.trim();
		return ns ? `${ns}/` : '';
	}

	/** Build a regex that matches quadrant tags with the current namespace */
	private buildQuadrantRegex(): RegExp {
		const prefix = this.escapeRegex(this.getPrefix());
		return new RegExp(`#${prefix}([a-zA-Z0-9_]+)-(ui|in|un|nn)\\b`, 'g');
	}

	/** Build a regex that matches priority tags with the current namespace */
	private buildPriorityRegex(): RegExp {
		const prefix = this.escapeRegex(this.getPrefix());
		return new RegExp(`#${prefix}([a-zA-Z0-9_]+)-(p1|p2)\\b`, 'g');
	}

	/**
	 * Parse all quadrant tags from a line of text.
	 * Returns a record of viewId -> QuadrantCode.
	 */
	parseQuadrantTags(line: string): Record<string, QuadrantCode> {
		const assignments: Record<string, QuadrantCode> = {};
		const regex = this.buildQuadrantRegex();
		let match;
		while ((match = regex.exec(line)) !== null) {
			const viewId = match[1];
			const quadrant = match[2] as QuadrantCode;
			assignments[viewId] = quadrant;
		}
		return assignments;
	}

	/**
	 * Parse all priority tags from a line of text.
	 * Returns a record of viewId -> PriorityLevel.
	 */
	parsePriorityTags(line: string): Record<string, PriorityLevel> {
		const assignments: Record<string, PriorityLevel> = {};
		const regex = this.buildPriorityRegex();
		let match;
		while ((match = regex.exec(line)) !== null) {
			const viewId = match[1];
			const priorityStr = match[2];
			const priority = parseInt(priorityStr.substring(1)) as PriorityLevel;
			assignments[viewId] = priority;
		}
		return assignments;
	}

	/**
	 * Build a new line with the quadrant tag for a specific viewId updated.
	 * If newQuadrant is null, the tag for that viewId is removed.
	 */
	buildUpdatedLine(rawLine: string, viewId: string, newQuadrant: QuadrantCode | null): string {
		const prefix = this.getPrefix();
		const escapedPrefix = this.escapeRegex(prefix);
		const tagPattern = new RegExp(
			`\\s*#${escapedPrefix}${this.escapeRegex(viewId)}-(ui|in|un|nn)\\b`, 'g'
		);
		const hasExisting = tagPattern.test(rawLine);

		if (hasExisting) {
			tagPattern.lastIndex = 0;
			if (newQuadrant === null) {
				return rawLine.replace(tagPattern, '').replace(/\s{2,}/g, ' ').trim();
			} else {
				return rawLine.replace(tagPattern, ` #${prefix}${viewId}-${newQuadrant}`);
			}
		} else if (newQuadrant !== null) {
			return `${rawLine} #${prefix}${viewId}-${newQuadrant}`;
		}

		return rawLine;
	}

	/**
	 * Build a new line with the priority tag for a specific viewId updated.
	 * If newPriority is 0 or null, the priority tag for that viewId is removed.
	 */
	buildUpdatedPriorityLine(rawLine: string, viewId: string, newPriority: PriorityLevel | 0 | null): string {
		const prefix = this.getPrefix();
		const escapedPrefix = this.escapeRegex(prefix);
		// Pattern to match existing priority tags for this viewId (p1 or p2)
		const tagPattern = new RegExp(
			`\\s*#${escapedPrefix}${this.escapeRegex(viewId)}-(p1|p2)\\b`, 'g'
		);
		const hasExisting = tagPattern.test(rawLine);

		if (hasExisting) {
			tagPattern.lastIndex = 0;
			if (newPriority === null || newPriority === 0) {
				// Remove existing priority tag
				return rawLine.replace(tagPattern, '').replace(/\s{2,}/g, ' ').trim();
			} else {
				// Replace with new priority tag
				return rawLine.replace(tagPattern, ` #${prefix}${viewId}-p${newPriority}`);
			}
		} else if (newPriority !== null && newPriority !== 0) {
			// Add new priority tag
			return `${rawLine} #${prefix}${viewId}-p${newPriority}`;
		}

		return rawLine;
	}

	/**
	 * Update a task's quadrant tag in its source file atomically.
	 */
	async updateQuadrantTag(
		task: Task,
		viewId: string,
		newQuadrant: QuadrantCode | null
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return false;

		const expectedRaw = task.rawLine;
		const newLine = this.buildUpdatedLine(expectedRaw, viewId, newQuadrant);

		if (newLine === expectedRaw) return true;

		let success = false;
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (task.lineNumber < lines.length && lines[task.lineNumber] === expectedRaw) {
				lines[task.lineNumber] = newLine;
				success = true;
				return lines.join('\n');
			}
			const idx = lines.indexOf(expectedRaw);
			if (idx !== -1) {
				lines[idx] = newLine;
				success = true;
				return lines.join('\n');
			}
			return content;
		});

		return success;
	}

	/**
	 * Set a task's priority tag in its source file atomically.
	 * priority=0 means remove the priority tag.
	 * priority=1 means set #T/viewId-p1 (第一任务).
	 * priority=2 means set #T/viewId-p2 (第二任务).
	 */
	async setTaskPriority(
		task: Task,
		viewId: string,
		priority: PriorityLevel | 0
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return false;

		const expectedRaw = task.rawLine;
		const newLine = this.buildUpdatedPriorityLine(expectedRaw, viewId, priority);

		if (newLine === expectedRaw) return true;

		let success = false;
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (task.lineNumber < lines.length && lines[task.lineNumber] === expectedRaw) {
				lines[task.lineNumber] = newLine;
				success = true;
				return lines.join('\n');
			}
			const idx = lines.indexOf(expectedRaw);
			if (idx !== -1) {
				lines[idx] = newLine;
				success = true;
				return lines.join('\n');
			}
			return content;
		});

		return success;
	}

	/**
	 * Toggle the checkbox state in the source file.
	 */
	async toggleTaskCompletion(task: Task): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return false;

		const expectedRaw = task.rawLine;
		const newCompleted = !task.completed;
		const newLine = newCompleted
			? expectedRaw.replace(/^(\s*- \[) \]/, '$1x]')
			: expectedRaw.replace(/^(\s*- \[)[xX]\]/, '$1 ]');

		if (newLine === expectedRaw) return false;

		let success = false;
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (task.lineNumber < lines.length && lines[task.lineNumber] === expectedRaw) {
				lines[task.lineNumber] = newLine;
				success = true;
				return lines.join('\n');
			}
			const idx = lines.indexOf(expectedRaw);
			if (idx !== -1) {
				lines[idx] = newLine;
				success = true;
				return lines.join('\n');
			}
			return content;
		});

		return success;
	}

	/**
	 * Strip all quadrant tags from a line to produce clean display text.
	 * Also strips the trigger tags like #task, #todo.
	 */
	cleanDisplayText(rawLine: string, triggerTags: string[]): string {
		let text = rawLine;
		// Remove checkbox prefix
		text = text.replace(/^\s*- \[[ xX]\]\s+/, '');
		// Remove quadrant tags (with namespace)
		const quadrantRegex = this.buildQuadrantRegex();
		text = text.replace(quadrantRegex, '');
		// Remove priority tags (with namespace)
		const priorityRegex = this.buildPriorityRegex();
		text = text.replace(priorityRegex, '');
		// Remove trigger tags (Unicode-safe, no \b)
		for (const tag of triggerTags) {
			const hashTag = '#' + tag;
			let result = '';
			let searchFrom = 0;
			while (true) {
				const idx = text.indexOf(hashTag, searchFrom);
				if (idx === -1) {
					result += text.slice(searchFrom);
					break;
				}
				const endPos = idx + hashTag.length;
				// Boundary check: before must be start or whitespace
				const beforeOk = idx === 0 || text[idx - 1] === ' ' || text[idx - 1] === '\t';
				// Boundary check: after must be end, whitespace, or #
				const afterOk = endPos >= text.length ||
					text[endPos] === ' ' || text[endPos] === '\t' ||
					text[endPos] === '#' || text[endPos] === '\n';
				if (beforeOk && afterOk) {
					result += text.slice(searchFrom, idx);
					searchFrom = endPos;
				} else {
					result += text.slice(searchFrom, endPos);
					searchFrom = endPos;
				}
			}
			text = result;
		}
		return text.replace(/\s{2,}/g, ' ').trim();
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
