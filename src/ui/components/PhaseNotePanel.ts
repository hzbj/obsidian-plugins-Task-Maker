import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { PluginSettings, PhaseDefinition } from '../../models/types';
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
		private getSettings: () => PluginSettings
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

		// Find the phase and its note file
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
		this.fileNameEl.title = `\u6253\u5F00 ${file.path}`;
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
	}

	hide(): void {
		this.el.style.display = 'none';
	}

	destroy(): void {
		this.renderComponent.unload();
		this.el.remove();
	}
}
