import { App, TFile, CachedMetadata, getAllTags } from 'obsidian';
import { Task, QuadrantCode, PluginSettings, DetectedPhaseInfo, PhaseNoteInfo } from '../models/types';
import { CHECKBOX_REGEX } from '../models/constants';
import { TagManagerService } from './TagManagerService';
import { EventBus } from './EventBus';

export class TaskScannerService {
	private taskCache: Map<string, Task[]> = new Map(); // filePath -> tasks
	private detectedPhases: Map<string, DetectedPhaseInfo> = new Map(); // filePath -> phase info

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

	/** Get all detected phase notes from last scan */
	getDetectedPhases(): DetectedPhaseInfo[] {
		return Array.from(this.detectedPhases.values());
	}

	/** Get all notes associated with a specific phase */
	getPhaseNotes(phaseId: string): PhaseNoteInfo[] {
		const notes: PhaseNoteInfo[] = [];
		this.detectedPhases.forEach((info) => {
			if (info.phaseId === phaseId) {
				// Extract file name without extension from path
				const parts = info.filePath.split('/');
				const fileName = (parts[parts.length - 1] || '').replace(/\.md$/, '');
				notes.push({
					filePath: info.filePath,
					fileName: fileName || info.phaseLabel,
					phaseId: info.phaseId,
				});
			}
		});
		return notes;
	}

	/** Full scan of the entire vault */
	async fullScan(): Promise<void> {
		this.taskCache.clear();
		this.detectedPhases.clear();
		const files = this.app.vault.getMarkdownFiles();
		const total = files.length;

		this.eventBus.emit('scan-progress', { scanned: 0, total });

		// Process in batches to avoid blocking UI
		const batchSize = 50;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			await Promise.all(batch.map(f => this.scanFile(f)));

			const scanned = Math.min(i + batchSize, total);
			this.eventBus.emit('scan-progress', { scanned, total });

			// Yield to UI between batches
			if (i + batchSize < files.length) {
				await sleep(0);
			}
		}

		this.eventBus.emit('scan-complete', { tasks: this.getAllTasks() });
	}

	/** Scan a single file and update cache. forceExtract=true skips trigger check. */
	async scanFile(file: TFile, forceExtract = false): Promise<Task[]> {
		const settings = this.getSettings();
		const content = await this.app.vault.cachedRead(file);
		const cache = this.app.metadataCache.getFileCache(file);

		const hasFrontmatterTrigger = this.checkFrontmatterTrigger(cache, settings.triggerTags);

		// Phase note detection: check for 'phase' property/tag in frontmatter
		this.detectPhaseFromFrontmatter(file, cache);

		// Force-extract tasks from phase notes (detected via frontmatter or registered in settings)
		const isPhaseNote = this.detectedPhases.has(file.path)
			|| settings.phases.some(p => p.noteFilePath === file.path);
		const shouldForce = forceExtract || isPhaseNote;

		// Normalize line endings: strip \r so Windows \r\n won't pollute line content
		const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
		const tasks: Task[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = CHECKBOX_REGEX.exec(line);
			if (!match) continue;

			const completed = match[2].toLowerCase() === 'x';
			const taskContent = match[4];

			// Check trigger condition (bypass when forced)
			const hasInlineTrigger = this.hasInlineTriggerTag(taskContent, settings.triggerTags);

			if (!shouldForce && !hasFrontmatterTrigger && !hasInlineTrigger) {
				continue; // Skip: no trigger
			}

			const quadrantAssignments = this.tagManager.parseQuadrantTags(line);
			const priorityAssignments = this.tagManager.parsePriorityTags(line);
			const text = this.tagManager.cleanDisplayText(line, settings.triggerTags);
			const indentLevel = (line.match(/^\t*/)?.[0] ?? '').length;

			tasks.push({
				id: `${file.path}:${i}`,
				text,
				rawLine: line,
				filePath: file.path,
				lineNumber: i,
				completed,
				triggerType: shouldForce ? 'frontmatter' : (hasFrontmatterTrigger ? 'frontmatter' : 'inline'),
				quadrantAssignments,
				priorityAssignments,
				indentLevel,
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
		if (!cache) return false;

		// Use Obsidian's getAllTags which reliably extracts frontmatter + body tags
		// Returns tags prefixed with #, e.g. ['#task', '#代办']
		const allTags = getAllTags(cache);
		if (!allTags || allTags.length === 0) return false;

		// We only want frontmatter tags for the "whole file" trigger.
		// getAllTags includes body tags too, but frontmatter tags are what we need.
		// Obsidian's cache.frontmatter stores raw YAML, so extract from there first.
		const fmTags = this.extractFrontmatterTags(cache);

		return triggerTags.some(trigger =>
			fmTags.some(ft => ft.toLowerCase() === trigger.toLowerCase())
		);
	}

	/** Extract tag strings from frontmatter, stripping # prefix, handling all formats */
	private extractFrontmatterTags(cache: CachedMetadata): string[] {
		const tags: string[] = [];
		if (!cache.frontmatter) return tags;

		// Obsidian stores frontmatter tags in multiple possible locations
		const sources = [
			cache.frontmatter.tags,
			cache.frontmatter.tag,
		];

		for (const raw of sources) {
			if (Array.isArray(raw)) {
				for (const t of raw) {
					if (typeof t === 'string') {
						tags.push(t.replace(/^#/, ''));
					}
				}
			} else if (typeof raw === 'string') {
				// Could be comma-separated: "task, 代办"
				const parts = raw.split(',');
				for (const p of parts) {
					const trimmed = p.trim().replace(/^#/, '');
					if (trimmed) tags.push(trimmed);
				}
			}
		}

		// Also try getAllTags as a fallback — filter to frontmatter-only tags
		// by checking if the tag position is within frontmatter range
		if (tags.length === 0 && cache.frontmatter) {
			const allTags = getAllTags(cache);
			if (allTags) {
				tags.push(...allTags.map(t => t.replace(/^#/, '')));
			}
		}

		return tags;
	}

	/** Check if a task line's content contains any trigger tag (Unicode-safe) */
	private hasInlineTriggerTag(content: string, triggerTags: string[]): boolean {
		for (const tag of triggerTags) {
			const hashTag = '#' + tag;
			let searchFrom = 0;
			while (true) {
				const idx = content.indexOf(hashTag, searchFrom);
				if (idx === -1) break;

				const endPos = idx + hashTag.length;
				// Check: character BEFORE # must be whitespace or start-of-string
				if (idx > 0) {
					const prevChar = content[idx - 1];
					if (prevChar !== ' ' && prevChar !== '\t') {
						searchFrom = endPos;
						continue;
					}
				}
				// Check: character AFTER tag must be whitespace, #, or end-of-string
				if (endPos >= content.length) return true;
				const nextChar = content[endPos];
				if (nextChar === ' ' || nextChar === '\t' || nextChar === '#' || nextChar === '\n') {
					return true;
				}
				searchFrom = endPos;
			}
		}
		return false;
	}

	clearCache(): void {
		this.taskCache.clear();
		this.detectedPhases.clear();
	}

	/** Detect phase definition from frontmatter properties or tags */
	private detectPhaseFromFrontmatter(file: TFile, cache: CachedMetadata | null): void {
		if (!cache?.frontmatter) {
			this.detectedPhases.delete(file.path);
			return;
		}

		// Check both: direct 'phase' property (phase: true) and 'phase' in tags array
		const hasPhaseProperty = cache.frontmatter['phase'] === true
			|| cache.frontmatter['phase'] === 'true';
		const fmTags = this.extractFrontmatterTags(cache);
		const hasPhaseTag = fmTags.some(t => t.toLowerCase() === 'phase');

		if (!hasPhaseProperty && !hasPhaseTag) {
			this.detectedPhases.delete(file.path);
			return;
		}

		const phaseId = cache.frontmatter['phase-id'];
		const phaseLabel = cache.frontmatter['phase-label'];

		if (typeof phaseId === 'string' && phaseId.trim()) {
			// Read optional time period from frontmatter
			const phaseStart = cache.frontmatter['phase-start'];
			const phaseEnd = cache.frontmatter['phase-end'];
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			const timePeriod = (typeof phaseStart === 'string' && dateRegex.test(phaseStart)
				&& typeof phaseEnd === 'string' && dateRegex.test(phaseEnd))
				? { start: phaseStart, end: phaseEnd }
				: undefined;

			this.detectedPhases.set(file.path, {
				phaseId: phaseId.trim(),
				phaseLabel: typeof phaseLabel === 'string' && phaseLabel.trim()
					? phaseLabel.trim()
					: phaseId.trim(),
				filePath: file.path,
				timePeriod,
			});
		} else {
			this.detectedPhases.delete(file.path);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
