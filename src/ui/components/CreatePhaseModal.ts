import { App, Modal, Setting, Notice } from 'obsidian';
import { PhaseDefinition } from '../../models/types';

export interface PhasePrefill {
	phaseId?: string;
	phaseLabel?: string;
	phaseStart?: string;
	phaseEnd?: string;
}

export class CreatePhaseModal extends Modal {
	private phaseId = '';
	private phaseLabel = '';
	private phaseStart = '';
	private phaseEnd = '';
	private selectedExistingPhaseId = '';
	private mode: 'create' | 'select' | 'complete' = 'select';

	constructor(
		app: App,
		private existingPhases: PhaseDefinition[],
		private onSubmit: (id: string, label: string, start: string, end: string) => void,
		private targetFileName?: string,
		private prefill?: PhasePrefill
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// If prefill is provided, enter complete mode
		if (this.prefill) {
			this.mode = 'complete';
			this.phaseId = this.prefill.phaseId ?? '';
			this.phaseLabel = this.prefill.phaseLabel ?? '';
			this.phaseStart = this.prefill.phaseStart ?? '';
			this.phaseEnd = this.prefill.phaseEnd ?? '';

			contentEl.createEl('h3', { text: '补全阶段属性' });
			if (this.targetFileName) {
				contentEl.createEl('p', {
					text: `目标笔记: ${this.targetFileName}`,
					cls: 'setting-item-description',
				});
			}
			this.renderCompleteForm(contentEl);
			return;
		}

		contentEl.createEl('h3', { text: '添加阶段属性' });

		if (this.targetFileName) {
			contentEl.createEl('p', {
				text: `目标笔记: ${this.targetFileName}`,
				cls: 'setting-item-description',
			});
		}

		// 如果有现有阶段，显示选择界面
		if (this.existingPhases.length > 0) {
			this.renderModeSelector(contentEl);
		} else {
			// 没有现有阶段，直接进入创建模式
			this.mode = 'create';
			this.renderCreateForm(contentEl);
			// 提交按钮
			new Setting(contentEl)
				.addButton(btn => btn
					.setButtonText('创建')
					.setCta()
					.onClick(() => this.handleSubmit())
				);
		}
	}

	private renderModeSelector(containerEl: HTMLElement): void {
		// 模式选择
		new Setting(containerEl)
			.setName('操作类型')
			.addDropdown(dropdown => {
				dropdown.addOption('select', '选择已有阶段');
				dropdown.addOption('create', '创建新阶段');
				dropdown.setValue(this.mode);
				dropdown.onChange((value: 'create' | 'select') => {
					this.mode = value;
					// 重新渲染表单部分
					const formContainer = containerEl.querySelector('.tm-phase-form-container');
					if (formContainer) {
						formContainer.empty();
						if (this.mode === 'select') {
							this.renderSelectForm(formContainer as HTMLElement);
						} else {
							this.renderCreateForm(formContainer as HTMLElement);
						}
					}
				});
			});

		// 表单容器
		const formContainer = containerEl.createDiv({ cls: 'tm-phase-form-container' });
		this.renderSelectForm(formContainer);

		// 提交按钮
		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('添加')
				.setCta()
				.onClick(() => this.handleSubmit())
			);
	}

	private renderSelectForm(containerEl: HTMLElement): void {
		containerEl.empty();
		
		new Setting(containerEl)
			.setName('选择阶段')
			.setDesc('将此笔记关联到已存在的阶段')
			.addDropdown(dropdown => {
				// 添加默认选项
				dropdown.addOption('', '-- 请选择阶段 --');
				
				// 按顺序添加所有阶段
				const sortedPhases = [...this.existingPhases].sort((a, b) => a.order - b.order);
				for (const phase of sortedPhases) {
					dropdown.addOption(phase.id, `${phase.label} (${phase.id})`);
				}
				
				dropdown.setValue(this.selectedExistingPhaseId);
				dropdown.onChange(value => {
					this.selectedExistingPhaseId = value;
					// 自动填充对应的 label
					const selectedPhase = this.existingPhases.find(p => p.id === value);
					if (selectedPhase) {
						this.phaseLabel = selectedPhase.label;
					}
				});
			});
	}

	private renderCreateForm(containerEl: HTMLElement): void {
		containerEl.empty();
		
		new Setting(containerEl)
			.setName('阶段 ID')
			.setDesc('字母开头，支持字母、数字、下划线，如 mvp')
			.addText(text => text
				.setPlaceholder('mvp')
				.onChange(v => { this.phaseId = v.trim(); })
			);

		new Setting(containerEl)
			.setName('显示名称')
			.addText(text => text
				.setPlaceholder('MVP阶段')
				.onChange(v => { this.phaseLabel = v.trim(); })
			);

		new Setting(containerEl)
			.setName('开始日期')
			.setDesc('格式: YYYY-MM-DD，可留空')
			.addText(text => text
				.setPlaceholder('2025-01-01')
				.onChange(v => { this.phaseStart = v.trim(); })
			);

		new Setting(containerEl)
			.setName('结束日期')
			.setDesc('格式: YYYY-MM-DD，可留空')
			.addText(text => text
				.setPlaceholder('2025-06-30')
				.onChange(v => { this.phaseEnd = v.trim(); })
			);
	}

	private renderCompleteForm(containerEl: HTMLElement): void {
		const hasMissingId = !this.prefill?.phaseId;
		const hasMissingLabel = !this.prefill?.phaseLabel;
		const hasMissingStart = !this.prefill?.phaseStart;
		const hasMissingEnd = !this.prefill?.phaseEnd;

		containerEl.createEl('p', {
			text: '该笔记已标记为阶段笔记，但缺少部分属性。请补全以下信息:',
			cls: 'setting-item-description',
		});

		if (hasMissingId) {
			new Setting(containerEl)
				.setName('阶段 ID')
				.setDesc('字母开头，支持字母、数字、下划线')
				.addText(text => text
					.setPlaceholder('mvp')
					.setValue(this.phaseId)
					.onChange(v => { this.phaseId = v.trim(); })
				);
		} else {
			new Setting(containerEl)
				.setName('阶段 ID')
				.setDesc(this.phaseId);
		}

		if (hasMissingLabel) {
			new Setting(containerEl)
				.setName('显示名称')
				.addText(text => text
					.setPlaceholder('MVP阶段')
					.setValue(this.phaseLabel)
					.onChange(v => { this.phaseLabel = v.trim(); })
				);
		} else {
			new Setting(containerEl)
				.setName('显示名称')
				.setDesc(this.phaseLabel);
		}

		if (hasMissingStart) {
			new Setting(containerEl)
				.setName('开始日期')
				.setDesc('格式: YYYY-MM-DD，可留空')
				.addText(text => text
					.setPlaceholder('2025-01-01')
					.setValue(this.phaseStart)
					.onChange(v => { this.phaseStart = v.trim(); })
				);
		} else {
			new Setting(containerEl)
				.setName('开始日期')
				.setDesc(this.phaseStart);
		}

		if (hasMissingEnd) {
			new Setting(containerEl)
				.setName('结束日期')
				.setDesc('格式: YYYY-MM-DD，可留空')
				.addText(text => text
					.setPlaceholder('2025-06-30')
					.setValue(this.phaseEnd)
					.onChange(v => { this.phaseEnd = v.trim(); })
				);
		} else {
			new Setting(containerEl)
				.setName('结束日期')
				.setDesc(this.phaseEnd);
		}

		// 提交按钮
		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('补全属性')
				.setCta()
				.onClick(() => this.handleSubmit())
			);
	}

	private handleSubmit(): void {
		if (this.mode === 'select') {
			if (!this.selectedExistingPhaseId) {
				new Notice('请选择一个阶段');
				return;
			}
			const selectedPhase = this.existingPhases.find(p => p.id === this.selectedExistingPhaseId);
			if (selectedPhase) {
				this.onSubmit(selectedPhase.id, selectedPhase.label, '', '');
				this.close();
			}
		} else if (this.mode === 'create') {
			if (!this.phaseId || !this.phaseLabel) {
				new Notice('请输入阶段 ID 和显示名称');
				return;
			}
			if (this.phaseStart && !/^\d{4}-\d{2}-\d{2}$/.test(this.phaseStart)) {
				new Notice('开始日期格式无效，请使用 YYYY-MM-DD 格式');
				return;
			}
			if (this.phaseEnd && !/^\d{4}-\d{2}-\d{2}$/.test(this.phaseEnd)) {
				new Notice('结束日期格式无效，请使用 YYYY-MM-DD 格式');
				return;
			}
			this.onSubmit(this.phaseId, this.phaseLabel, this.phaseStart, this.phaseEnd);
			this.close();
		} else {
			// complete mode
			if (!this.phaseId) {
				new Notice('请输入阶段 ID');
				return;
			}
			if (!this.phaseLabel) {
				new Notice('请输入显示名称');
				return;
			}
			if (this.phaseStart && !/^\d{4}-\d{2}-\d{2}$/.test(this.phaseStart)) {
				new Notice('开始日期格式无效，请使用 YYYY-MM-DD 格式');
				return;
			}
			if (this.phaseEnd && !/^\d{4}-\d{2}-\d{2}$/.test(this.phaseEnd)) {
				new Notice('结束日期格式无效，请使用 YYYY-MM-DD 格式');
				return;
			}
			this.onSubmit(this.phaseId, this.phaseLabel, this.phaseStart, this.phaseEnd);
			this.close();
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
