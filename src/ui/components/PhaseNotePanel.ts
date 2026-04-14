import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { PluginSettings, PhaseDefinition, PhaseNoteInfo } from '../../models/types';
import { extractNoteContent } from '../utils/noteContentExtractor';

export class PhaseNotePanel {
	el: HTMLElement;
	private headerEl: HTMLElement;
	private bodyEl: HTMLElement;
	private fileNameEl: HTMLElement;
	private contentEl: HTMLElement;
	private expanded: boolean;
	private renderComponent: Component;

	constructor(
		parentEl: HTMLElement,
		private app: App,
		private getSettings: () => PluginSettings,
		private getPhaseNotes?: (phaseId: string) => PhaseNoteInfo[]
	) {
		this.expanded = this.getSettings().ui.notePanel.defaultExpanded;
		this.renderComponent = new Component();
		this.renderComponent.load();

		this.el = parentEl.createDiv({ cls: 'tm-note-panel' });
		this.el.style.display = 'none';

		// Header (click to toggle collapse)
		this.headerEl = this.el.createDiv({ cls: 'tm-note-panel-header' });

		const toggleEl = this.headerEl.createSpan({ cls: 'tm-note-panel-toggle' });
		toggleEl.textContent = this.expanded ? '\u25BC' : '\u25B6';

		const titleEl = this.headerEl.createSpan({ cls: 'tm-note-panel-title' });
		titleEl.textContent = '\u7B14\u8BB0\u5185\u5BB9';

		this.fileNameEl = this.headerEl.createSpan({ cls: 'tm-note-panel-filename' });

		this.headerEl.addEventListener('click', (e) => {
			// Don't toggle when clicking the filename link
			if ((e.target as HTMLElement).classList.contains('tm-note-panel-filename')) return;
			this.expanded = !this.expanded;
			toggleEl.textContent = this.expanded ? '\u25BC' : '\u25B6';
			this.bodyEl.style.display = this.expanded ? 'block' : 'none';
		});

		// Body (collapsible content area)
		this.bodyEl = this.el.createDiv({ cls: 'tm-note-panel-body' });
		this.bodyEl.style.display = this.expanded ? 'block' : 'none';

		this.contentEl = this.bodyEl.createDiv({ cls: 'tm-note-panel-content' });
	}

	async update(phaseId: string, phases: PhaseDefinition[]): Promise<void> {
		const settings = this.getSettings();
	
		if (!settings.ui.notePanel.enabled) {
			this.el.style.display = 'none';
			return;
		}
	
		// Get all notes for this phase
		const phaseNotes = this.getPhaseNotes?.(phaseId) ?? [];
	
		// Fallback to single file mode if no phase notes found via callback
		if (phaseNotes.length === 0) {
			const phase = phases.find(p => p.id === phaseId);
			if (!phase?.noteFilePath) {
				this.el.style.display = 'none';
				return;
			}
	
			const file = this.app.vault.getAbstractFileByPath(phase.noteFilePath);
			if (!(file instanceof TFile)) {
				this.el.style.display = 'none';
				return;
			}
	
			// Read and extract content
			const rawContent = await this.app.vault.cachedRead(file);
			const markdown = extractNoteContent(rawContent, settings.ui.notePanel.headings);
	
			if (!markdown.trim()) {
				this.el.style.display = 'none';
				return;
			}
	
			// Update filename link
			this.fileNameEl.textContent = file.basename;
			this.fileNameEl.title = `打开 ${file.path}`;
			this.fileNameEl.onclick = (e) => {
				e.stopPropagation();
				this.app.workspace.openLinkText(file.path, '', false);
			};
	
			// Render markdown content
			this.contentEl.empty();
			await MarkdownRenderer.render(
				this.app,
				markdown,
				this.contentEl,
				file.path,
				this.renderComponent
			);
	
			this.el.style.display = 'block';
			return;
		}
	
		// Multi-file mode: merge content from all notes
		const contentParts: string[] = [];
		const validFiles: { file: TFile; noteInfo: PhaseNoteInfo }[] = [];
	
		for (const noteInfo of phaseNotes) {
			const file = this.app.vault.getAbstractFileByPath(noteInfo.filePath);
			if (!(file instanceof TFile)) continue;
	
			const rawContent = await this.app.vault.cachedRead(file);
			const markdown = extractNoteContent(rawContent, settings.ui.notePanel.headings);
	
			if (markdown.trim()) {
				contentParts.push(markdown);
				validFiles.push({ file, noteInfo });
			}
		}
	
		if (contentParts.length === 0) {
			this.el.style.display = 'none';
			return;
		}
	
		// Update filename display
		if (validFiles.length === 1) {
			this.fileNameEl.textContent = validFiles[0].file.basename;
			this.fileNameEl.title = `打开 ${validFiles[0].file.path}`;
			this.fileNameEl.onclick = (e) => {
				e.stopPropagation();
				this.app.workspace.openLinkText(validFiles[0].file.path, '', false);
			};
		} else {
			this.fileNameEl.textContent = `${validFiles.length} 个笔记`;
			this.fileNameEl.title = validFiles.map(v => v.file.path).join('\n');
			this.fileNameEl.onclick = null;
		}
	
		// Render merged content
		this.contentEl.empty();
		const mergedMarkdown = contentParts.length > 1
			? contentParts.join('\n\n---\n\n')
			: contentParts[0];
	
		await MarkdownRenderer.render(
			this.app,
			mergedMarkdown,
			this.contentEl,
			validFiles[0]?.file.path || '',
			this.renderComponent
		);
	
		this.el.style.display = 'block';
	}

	hide(): void {
		this.el.style.display = 'none';
	}

	destroy(): void {
		this.renderComponent.unload();
		this.el.remove();
	}
}
