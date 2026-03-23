import { App, Modal, Setting, Notice } from 'obsidian';

export class CreatePhaseModal extends Modal {
	private phaseId = '';
	private phaseLabel = '';

	constructor(app: App, private onSubmit: (id: string, label: string) => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl('h3', { text: '新建阶段笔记' });

		new Setting(contentEl)
			.setName('阶段 ID')
			.setDesc('字母开头，支持字母、数字、下划线，如 mvp')
			.addText(text => text
				.setPlaceholder('mvp')
				.onChange(v => { this.phaseId = v.trim(); })
			);

		new Setting(contentEl)
			.setName('显示名称')
			.addText(text => text
				.setPlaceholder('MVP阶段')
				.onChange(v => { this.phaseLabel = v.trim(); })
			);

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('创建')
				.setCta()
				.onClick(() => {
					if (!this.phaseId || !this.phaseLabel) {
						new Notice('请输入阶段 ID 和显示名称');
						return;
					}
					this.onSubmit(this.phaseId, this.phaseLabel);
					this.close();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
