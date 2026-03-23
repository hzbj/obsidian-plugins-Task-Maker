import { App, TFile, CachedMetadata } from 'obsidian';
import { Task, QuadrantCode, PluginSettings } from '../models/types';
import { CHECKBOX_REGEX } from '../models/constants';
import { TagManagerService } from './TagManagerService';
import { EventBus } from './EventBus';

export class TaskScannerService {
	private taskCache: Map<string, Task[]> = new Map(); // filePath -> tasks

	constructor(
		private app: App,
		private tagManager: TagManagerService,
		private eventBus: EventBus,
		private getSettings: () => PluginSettings
	) {}

	/** Get all cached tasks as a flat array */
	getAllTasks(): Task[] {
		const all: Task[] = [];
		this.taskCache.forEach(tasks => all.push(...tasks));
		return all;
	}

	/** Full scan of the entire vault */
	async fullScan(): Promise<void> {
		this.taskCache.clear();
		const files = this.app.vault.getMarkdownFiles();

		// Process in batches to avoid blocking UI
		const batchSize = 50;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			await Promise.all(batch.map(f => this.scanFile(f)));
			// Yield to UI between batches
			if (i + batchSize < files.length) {
				await sleep(0);
			}
		}

		this.eventBus.emit('scan-complete', { tasks: this.getAllTasks() });
	}

	/** Scan a single file and update cache */
	async scanFile(file: TFile): Promise<Task[]> {
		const settings = this.getSettings();
		const content = await this.app.vault.cachedRead(file);
		const cache = this.app.metadataCache.getFileCache(file);

		const hasFrontmatterTrigger = this.checkFrontmatterTrigger(cache, settings.triggerTags);
		const lines = content.split('\n');
		const tasks: Task[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = CHECKBOX_REGEX.exec(line);
			if (!match) continue;

			const completed = match[2].toLowerCase() === 'x';
			const taskContent = match[4];

			// Check trigger condition
			const hasInlineTrigger = this.hasInlineTriggerTag(taskContent, settings.triggerTags);

			if (!hasFrontmatterTrigger && !hasInlineTrigger) {
				continue; // Skip: no trigger
			}

			const quadrantAssignments = this.tagManager.parseQuadrantTags(line);
			const text = this.tagManager.cleanDisplayText(line, settings.triggerTags);

			tasks.push({
				id: `${file.path}:${i}`,
				text,
				rawLine: line,
				filePath: file.path,
				lineNumber: i,
				completed,
				triggerType: hasFrontmatterTrigger ? 'frontmatter' : 'inline',
				quadrantAssignments,
			});
		}

		this.taskCache.set(file.path, tasks);
		return tasks;
	}

	/** Incremental scan for a single modified file */
	async incrementalScan(file: TFile): Promise<void> {
		const tasks = await this.scanFile(file);
		this.eventBus.emit('tasks-changed', { filePath: file.path, tasks });
	}

	/** Check if file's frontmatter tags contain any trigger tag */
	private checkFrontmatterTrigger(cache: CachedMetadata | null, triggerTags: string[]): boolean {
		if (!cache?.frontmatter) return false;

		const fmTags: string[] = [];

		// Obsidian stores tags in frontmatter.tags (array or string)
		const rawTags = cache.frontmatter.tags;
		if (Array.isArray(rawTags)) {
			fmTags.push(...rawTags.map((t: string) => t.replace(/^#/, '').toLowerCase()));
		} else if (typeof rawTags === 'string') {
			fmTags.push(rawTags.replace(/^#/, '').toLowerCase());
		}

		// Also check frontmatter.tag (singular)
		const rawTag = cache.frontmatter.tag;
		if (Array.isArray(rawTag)) {
			fmTags.push(...rawTag.map((t: string) => t.replace(/^#/, '').toLowerCase()));
		} else if (typeof rawTag === 'string') {
			fmTags.push(rawTag.replace(/^#/, '').toLowerCase());
		}

		return triggerTags.some(trigger => fmTags.includes(trigger.toLowerCase()));
	}

	/** Check if a task line's content contains any trigger tag */
	private hasInlineTriggerTag(content: string, triggerTags: string[]): boolean {
		for (const tag of triggerTags) {
			const regex = new RegExp(`#${escapeRegex(tag)}(?=[\\s#]|$)`, 'i');
			if (regex.test(content)) return true;
		}
		return false;
	}

	clearCache(): void {
		this.taskCache.clear();
	}
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
