import { App, TFile } from 'obsidian';
import { QuadrantCode, Task, PluginSettings } from '../models/types';

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
		const regex = this.buildQuadrantRegex();
		text = text.replace(regex, '');
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
