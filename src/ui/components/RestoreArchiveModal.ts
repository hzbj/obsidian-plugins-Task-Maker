import { App, Modal, Setting, Notice } from 'obsidian';
import { PhaseDefinition, ArchiveCategoryDef } from '../../models/types';

export class RestoreArchiveModal extends Modal {
	constructor(
		app: App,
		private archivedPhases: PhaseDefinition[],
		private categories: ArchiveCategoryDef[],
		private onRestore: (phaseId: string, targetPath?: string) => Promise<void>
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

		// Header: phase label + category
		const categoryLabel = info
			? this.categories.find(c => c.code === info.categoryCode)?.label ?? info.categoryCode
			: '未知';

		const headerEl = itemEl.createDiv({ cls: 'tm-restore-phase-header' });
		headerEl.createEl('strong', { text: phase.label });
		headerEl.createSpan({ text: ` [${categoryLabel}]`, cls: 'tm-restore-phase-category' });

		// Info section
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
			let itemSummary = '';
			if (fileCount > 0) itemSummary += `${fileCount} 个文件`;
			if (folderCount > 0) itemSummary += `${itemSummary ? '、' : ''}${folderCount} 个文件夹`;
			if (itemSummary) {
				infoEl.createDiv({ text: `包含: ${itemSummary}` });
			}
		} else {
			infoEl.createDiv({ text: '无归档详情（旧版归档）', cls: 'setting-item-description' });
		}

		// Buttons
		const btnSetting = new Setting(itemEl);
		btnSetting.addButton(btn => btn
			.setButtonText('恢复到原路径')
			.setCta()
			.onClick(async () => {
				await this.onRestore(phase.id);
				this.renderSuccess(itemEl, phase.label);
			})
		);
		btnSetting.addButton(btn => btn
			.setButtonText('恢复到...')
			.onClick(() => {
				this.showCustomPathInput(itemEl, phase);
			})
		);
	}

	private showCustomPathInput(itemEl: HTMLElement, phase: PhaseDefinition): void {
		// Remove previous custom path input if exists
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
					this.renderSuccess(itemEl, phase.label);
				})
			);
	}

	private renderSuccess(itemEl: HTMLElement, phaseLabel: string): void {
		itemEl.empty();
		itemEl.createDiv({
			cls: 'tm-restore-success',
			text: `✓ 阶段「${phaseLabel}」已成功恢复`,
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
