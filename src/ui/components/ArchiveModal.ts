import { App, Modal, Setting, Notice } from 'obsidian';
import { ArchiveCategoryDef } from '../../models/types';

export class ArchiveModal extends Modal {
	private selectedCategory = '';
	private selectedFiles: Set<string> = new Set();
	private selectedFolders: Set<string> = new Set();
	private fileCheckboxes: Map<string, HTMLInputElement> = new Map();
	private previewEl: HTMLElement | null = null;
	private customName = '';

	constructor(
		app: App,
		private phaseLabel: string,
		private categories: ArchiveCategoryDef[],
		private noteFiles: { filePath: string; fileName: string }[],
		private parentFolders: { folderPath: string; folderName: string; fileCount: number; otherFiles: { filePath: string; fileName: string }[] }[],
		private buildFolderName: (categoryCode: string, phaseLabel: string) => string,
		private onSubmit: (categoryCode: string, selectedFiles: string[], selectedFolders: string[], customName: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tm-archive-modal');

		contentEl.createEl('h3', { text: `归档阶段: ${this.phaseLabel}` });

		// Project name (editable, defaults to phase label)
		new Setting(contentEl)
			.setName('项目名称')
			.setDesc('可自定义项目名称，用于生成归档文件夹名')
			.addText(text => {
				text.setValue(this.phaseLabel)
					.setPlaceholder(this.phaseLabel);
				text.onChange(value => {
					this.customName = value.trim();
					this.updatePreview();
				});
			});

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

		// Folder selection
		if (this.parentFolders.length > 0) {
			contentEl.createEl('h4', { text: '关联文件夹' });
			const folderListEl = contentEl.createDiv({ cls: 'tm-archive-folder-list' });

			for (const folder of this.parentFolders) {
				const itemEl = folderListEl.createDiv({ cls: 'tm-archive-folder-item' });
				const label = itemEl.createEl('label');
				const checkbox = label.createEl('input', { type: 'checkbox' });

				checkbox.addEventListener('change', () => {
					if (checkbox.checked) {
						this.selectedFolders.add(folder.folderPath);
						this.updateFileCheckboxesForFolder(folder.folderPath, true);
					} else {
						this.selectedFolders.delete(folder.folderPath);
						this.updateFileCheckboxesForFolder(folder.folderPath, false);
					}
				});

				label.createSpan({ text: ` 📁 ${folder.folderName} (${folder.fileCount} 个阶段文件)` });

				// Other files in the same folder (not belonging to current phase)
				if (folder.otherFiles.length > 0) {
					const otherToggle = itemEl.createEl('div', { cls: 'tm-other-files-toggle' });
					otherToggle.setText(`▶ 其他文件 (${folder.otherFiles.length})`);
					const otherContainer = itemEl.createDiv({ cls: 'tm-other-files-container' });
					otherContainer.style.display = 'none';

					otherToggle.addEventListener('click', () => {
						const isHidden = otherContainer.style.display === 'none';
						otherContainer.style.display = isHidden ? 'block' : 'none';
						otherToggle.setText(`${isHidden ? '▼' : '▶'} 其他文件 (${folder.otherFiles.length})`);
					});

					for (const otherFile of folder.otherFiles) {
						const otherItemEl = otherContainer.createDiv({ cls: 'tm-other-file-item' });
						const otherLabel = otherItemEl.createEl('label');
						const otherCb = otherLabel.createEl('input', { type: 'checkbox' });

						this.fileCheckboxes.set(otherFile.filePath, otherCb);

						otherCb.addEventListener('change', () => {
							if (otherCb.checked) {
								this.selectedFiles.add(otherFile.filePath);
							} else {
								this.selectedFiles.delete(otherFile.filePath);
							}
						});

						otherLabel.createSpan({ text: ` ${otherFile.fileName}` });
					}
				}
			}
		}

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

				this.fileCheckboxes.set(note.filePath, checkbox);

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
		if (!this.selectedCategory && !this.customName) {
			this.previewEl.setText('请选择分类或输入自定义名称以预览归档路径');
			return;
		}
		const name = this.customName || this.phaseLabel;
		let folderName: string;
		if (this.selectedCategory) {
			folderName = this.buildFolderName(this.selectedCategory, name);
		} else {
			folderName = name;
		}
		this.previewEl.setText(`归档路径: ${folderName}/`);
	}

	private updateFileCheckboxesForFolder(folderPath: string, folderSelected: boolean): void {
		const prefix = folderPath + '/';
		// Handle phase note files
		for (const note of this.noteFiles) {
			if (note.filePath.startsWith(prefix)) {
				const cb = this.fileCheckboxes.get(note.filePath);
				if (cb) {
					if (folderSelected) {
						cb.checked = true;
						cb.disabled = true;
						this.selectedFiles.add(note.filePath);
					} else {
						cb.disabled = false;
					}
				}
			}
		}
		// Handle other files in the folder
		const folder = this.parentFolders.find(f => f.folderPath === folderPath);
		if (folder) {
			for (const otherFile of folder.otherFiles) {
				const cb = this.fileCheckboxes.get(otherFile.filePath);
				if (cb) {
					if (folderSelected) {
						cb.checked = true;
						cb.disabled = true;
						this.selectedFiles.add(otherFile.filePath);
					} else {
						cb.disabled = false;
					}
				}
			}
		}
	}

	private handleSubmit(): void {
		if (!this.selectedCategory && !this.customName) {
			new Notice('请选择归档分类或输入自定义名称');
			return;
		}
		if (this.selectedFiles.size === 0 && this.noteFiles.length > 0 && this.selectedFolders.size === 0) {
			new Notice('请至少选择一个笔记文件或文件夹');
			return;
		}
		this.onSubmit(this.selectedCategory, Array.from(this.selectedFiles), Array.from(this.selectedFolders), this.customName);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
