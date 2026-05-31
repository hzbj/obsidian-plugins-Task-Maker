import { App, Modal, Setting, Notice } from 'obsidian';
import { PhaseDefinition, ArchiveCategoryDef } from '../../models/types';

export class RestoreArchiveModal extends Modal {
	private clearConfirmPhases: Set<string> = new Set();

	constructor(
		app: App,
		private archivedPhases: PhaseDefinition[],
		private categories: ArchiveCategoryDef[],
		private onRestore: (phaseId: string, targetPath?: string) => Promise<void>,
		private onClearFields?: (phaseId: string) => Promise<void>,
		private onRenamePhase?: (phaseId: string, newLabel: string) => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('tm-restore-modal');

		contentEl.createEl('h3', { text: '已归档阶段' });

		if (this.archivedPhases.length === 0) {
			contentEl.createEl('p', {
				text: '暂无已归档的阶段',
				cls: 'setting-item-description',
			});
			new Setting(contentEl)
				.addButton(btn => btn
					.setButtonText('关闭')
					.onClick(() => this.close())
				);
			return;
		}

		for (const phase of this.archivedPhases) {
			this.renderPhaseItem(contentEl, phase);
		}

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('关闭')
				.onClick(() => this.close())
			);
	}

	private renderPhaseItem(containerEl: HTMLElement, phase: PhaseDefinition): void {
		const itemEl = containerEl.createDiv({ cls: 'tm-restore-phase-item' });
		const info = phase.archiveInfo;
		const categoryLabel = info
			? this.categories.find(c => c.code === info.categoryCode)?.label ?? info.categoryCode
			: '未知';

		const headerEl = itemEl.createDiv({ cls: 'tm-restore-phase-header' });
		const labelEl = headerEl.createEl('strong', { cls: 'tm-restore-phase-label' });
		labelEl.textContent = phase.label;
		if (this.onRenamePhase) {
			labelEl.title = '点击编辑项目名称';
			labelEl.style.cursor = 'pointer';
			labelEl.addEventListener('click', () => {
				this.startInlineEdit(labelEl, phase);
			});
		}

		headerEl.createSpan({ text: ` [${categoryLabel}]`, cls: 'tm-restore-phase-category' });

		const infoEl = itemEl.createDiv({ cls: 'tm-restore-phase-info' });
		if (info) {
			const archivedDate = new Date(info.archivedAt);
			const dateStr = archivedDate.toLocaleDateString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			});
			infoEl.createDiv({ text: `归档时间: ${dateStr}` });
			infoEl.createDiv({ text: `归档路径: ${info.archivePath}` });

			const fileCount = info.archivedItems.filter(i => i.type === 'file').length;
			const folderCount = info.archivedItems.filter(i => i.type === 'folder').length;
			const itemSummary = [
				fileCount > 0 ? `${fileCount} 个文件` : '',
				folderCount > 0 ? `${folderCount} 个文件夹` : '',
			].filter(Boolean).join('、');
			if (itemSummary) {
				infoEl.createDiv({ text: `包含: ${itemSummary}` });
			}
		} else {
			infoEl.createDiv({ text: '无归档详情（旧版归档）', cls: 'setting-item-description' });
		}

		const btnSetting = new Setting(itemEl);
		btnSetting.addButton(btn => btn
			.setButtonText('恢复到原路径')
			.setCta()
			.onClick(async () => {
				await this.onRestore(phase.id);
				this.renderSuccess(itemEl, `阶段「${phase.label}」已恢复`);
			})
		);
		btnSetting.addButton(btn => btn
			.setButtonText('恢复到...')
			.onClick(() => {
				this.showCustomPathInput(itemEl, phase);
			})
		);

		if (this.onClearFields) {
			btnSetting.addButton(btn => {
				const isConfirming = this.clearConfirmPhases.has(phase.id);
				btn.setButtonText(isConfirming ? '确认清除字段' : '清除字段')
					.setWarning()
					.onClick(async () => {
						if (!this.clearConfirmPhases.has(phase.id)) {
							this.clearConfirmPhases.add(phase.id);
							btn.setButtonText('确认清除字段');
							return;
						}
						this.clearConfirmPhases.delete(phase.id);
						await this.onClearFields!(phase.id);
						this.archivedPhases = this.archivedPhases.filter(p => p.id !== phase.id);
						this.onOpen();
					});
				return btn;
			});
		}
	}

	private showCustomPathInput(itemEl: HTMLElement, phase: PhaseDefinition): void {
		const existing = itemEl.querySelector('.tm-restore-custom-path');
		if (existing) {
			existing.remove();
			return;
		}

		const inputEl = itemEl.createDiv({ cls: 'tm-restore-custom-path' });
		let customPath = '';

		new Setting(inputEl)
			.setName('目标路径')
			.setDesc('输入要恢复到的文件夹路径')
			.addText(text => text
				.setPlaceholder('例如: Projects/MyProject')
				.onChange(value => { customPath = value.trim(); })
			)
			.addButton(btn => btn
				.setButtonText('确认恢复')
				.setCta()
				.onClick(async () => {
					if (!customPath) {
						new Notice('请输入目标路径');
						return;
					}
					await this.onRestore(phase.id, customPath);
					this.renderSuccess(itemEl, `阶段「${phase.label}」已恢复`);
				})
			);
	}

	private startInlineEdit(labelEl: HTMLElement, phase: PhaseDefinition): void {
		const originalText = labelEl.textContent || '';
		const input = document.createElement('input');
		input.type = 'text';
		input.value = originalText;
		input.className = 'tm-restore-phase-label-input';
		input.style.cssText = 'font-weight:bold;font-size:inherit;font-family:inherit;border:1px solid var(--interactive-accent);border-radius:4px;padding:2px 6px;background:var(--background-primary);color:var(--text-normal);';

		labelEl.replaceWith(input);
		input.focus();
		input.select();

		const finishEdit = async () => {
			const newLabel = input.value.trim();
			if (newLabel && newLabel !== originalText && this.onRenamePhase) {
				await this.onRenamePhase(phase.id, newLabel);
				phase.label = newLabel;
			}

			const newLabelEl = document.createElement('strong');
			newLabelEl.className = 'tm-restore-phase-label';
			newLabelEl.textContent = newLabel || originalText;
			newLabelEl.title = '点击编辑项目名称';
			newLabelEl.style.cursor = 'pointer';
			newLabelEl.addEventListener('click', () => {
				this.startInlineEdit(newLabelEl, phase);
			});
			input.replaceWith(newLabelEl);
		};

		input.addEventListener('blur', finishEdit);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				input.blur();
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				input.value = originalText;
				input.blur();
			}
		});
	}

	private renderSuccess(itemEl: HTMLElement, message: string): void {
		itemEl.empty();
		itemEl.createDiv({
			cls: 'tm-restore-success',
			text: `✓ ${message}`,
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
