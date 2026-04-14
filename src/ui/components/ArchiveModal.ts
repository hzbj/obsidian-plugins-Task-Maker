import { App, Modal, Setting, Notice } from 'obsidian';
import { ArchiveCategoryDef } from '../../models/types';

export class ArchiveModal extends Modal {
	private selectedCategory = '';
	private selectedFiles: Set<string> = new Set();
	private previewEl: HTMLElement | null = null;

	constructor(
		app: App,
		private phaseLabel: string,
		private categories: ArchiveCategoryDef[],
		private noteFiles: { filePath: string; fileName: string }[],
		private buildFolderName: (categoryCode: string, phaseLabel: string) => string,
		private onSubmit: (categoryCode: string, selectedFiles: string[]) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tm-archive-modal');

		contentEl.createEl('h3', { text: `归档阶段: ${this.phaseLabel}` });

		// Project name (read-only, from phase-label)
		new Setting(contentEl)
			.setName('项目名称')
			.setDesc('取自阶段的显示名称')
			.addText(text => text
				.setValue(this.phaseLabel)
				.setDisabled(true)
			);

		// Category selection
		new Setting(contentEl)
			.setName('归档分类')
			.setDesc('选择归档分类')
			.addDropdown(dropdown => {
				dropdown.addOption('', '-- 请选择分类 --');
				for (const cat of this.categories) {
					dropdown.addOption(cat.code, `${cat.code} - ${cat.label}`);
				}
				dropdown.onChange(value => {
					this.selectedCategory = value;
					this.updatePreview();
				});
			});

		// Archive path preview
		this.previewEl = contentEl.createDiv({ cls: 'tm-archive-preview' });
		this.previewEl.setText('请选择分类以预览归档路径');

		// Note file list
		if (this.noteFiles.length > 0) {
			contentEl.createEl('h4', { text: '关联笔记' });
			const listEl = contentEl.createDiv({ cls: 'tm-archive-note-list' });

			for (const note of this.noteFiles) {
				const itemEl = listEl.createDiv({ cls: 'tm-archive-note-item' });
				const label = itemEl.createEl('label');
				const checkbox = label.createEl('input', { type: 'checkbox' });
				checkbox.checked = true;
				this.selectedFiles.add(note.filePath);

				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.selectedFiles.add(note.filePath);
					} else {
						this.selectedFiles.delete(note.filePath);
					}
				});

				label.createSpan({ text: note.fileName });
			}
		} else {
			contentEl.createEl('p', {
				text: '此阶段没有关联的笔记文件',
				cls: 'setting-item-description',
			});
		}

		// Buttons
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('确认归档')
				.setCta()
				.onClick(() => this.handleSubmit())
			)
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => this.close())
			);
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		if (!this.selectedCategory) {
			this.previewEl.setText('请选择分类以预览归档路径');
			return;
		}
		const folderName = this.buildFolderName(this.selectedCategory, this.phaseLabel);
		this.previewEl.setText(`归档路径: ${folderName}/`);
	}

	private handleSubmit(): void {
		if (!this.selectedCategory) {
			new Notice('请选择归档分类');
			return;
		}
		if (this.selectedFiles.size === 0 && this.noteFiles.length > 0) {
			new Notice('请至少选择一个笔记文件');
			return;
		}
		this.onSubmit(this.selectedCategory, Array.from(this.selectedFiles));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
