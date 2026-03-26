import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { PluginSettings, PhaseDefinition } from '../models/types';
import { ViewRegistryService } from '../services/ViewRegistryService';
import { EventBus } from '../services/EventBus';
import { CreatePhaseModal } from '../ui/components/CreatePhaseModal';
import type TaskMakerPlugin from '../main';

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: TaskMakerPlugin,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings = this.plugin.settings;

		// ─── Trigger Tags ───
		containerEl.createEl('h2', { text: '任务触发标签' });
		new Setting(containerEl)
			.setName('触发标签')
			.setDesc('包含这些标签的笔记或任务行将被提取。用逗号分隔，不含 # 号。')
			.addText(text => text
				.setPlaceholder('task, todo')
				.setValue(settings.triggerTags.join(', '))
				.onChange(async (value) => {
					settings.triggerTags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('标签命名空间')
			.setDesc('插件创建的象限标签将嵌套在此命名空间下，如设为 T 则标签格式为 #T/viewId-quadrant。留空则不加前缀。')
			.addText(text => text
				.setPlaceholder('T')
				.setValue(settings.tagNamespace)
				.onChange(async (value) => {
					settings.tagNamespace = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ─── Phase Management ───
		containerEl.createEl('h2', { text: '阶段管理' });

		new Setting(containerEl)
			.setName('一键创建阶段笔记')
			.setDesc('创建带有正确 frontmatter 的阶段规划笔记')
			.addButton(btn => btn
				.setButtonText('新建阶段笔记')
				.setCta()
				.onClick(() => {
					new CreatePhaseModal(this.app, [], async (id, label) => {
						await this.plugin.createPhaseNote(id, label);
						this.display();
					}).open();
				})
			);

		this.renderPhaseList(containerEl, settings);

		// ─── UI Customization ───
		containerEl.createEl('h2', { text: '界面定制' });

		const quadrantCodes = ['ui', 'in', 'un', 'nn'] as const;
		const defaultLabels = ['紧急且重要', '重要不紧急', '紧急不重要', '不紧急不重要'];

		for (let i = 0; i < quadrantCodes.length; i++) {
			const code = quadrantCodes[i];
			new Setting(containerEl)
				.setName(`${defaultLabels[i]} 标签`)
				.addText(text => text
					.setValue(settings.ui.quadrantLabels[code])
					.onChange(async (value) => {
						settings.ui.quadrantLabels[code] = value;
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(containerEl)
			.setName('显示来源文件')
			.addToggle(toggle => toggle
				.setValue(settings.ui.showSourceFile)
				.onChange(async (value) => {
					settings.ui.showSourceFile = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('紧凑模式')
			.addToggle(toggle => toggle
				.setValue(settings.ui.compactMode)
				.onChange(async (value) => {
					settings.ui.compactMode = value;
					await this.plugin.saveSettings();
				})
			);

		// ─── Note Panel ───
		containerEl.createEl('h2', { text: '笔记内容面板' });

		new Setting(containerEl)
			.setName('启用笔记内容面板')
			.setDesc('在象限矩阵上方显示阶段笔记中特定标题下的内容')
			.addToggle(toggle => toggle
				.setValue(settings.ui.notePanel.enabled)
				.onChange(async (value) => {
					settings.ui.notePanel.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('提取标题')
			.setDesc('从这些标题下提取内容显示在面板中，用逗号分隔。')
			.addText(text => text
				.setPlaceholder('目标, Goals, Plan, 计划, 概述, Overview')
				.setValue(settings.ui.notePanel.headings.join(', '))
				.onChange(async (value) => {
					settings.ui.notePanel.headings = value
						.split(',')
						.map(h => h.trim())
						.filter(h => h.length > 0);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('默认展开')
			.setDesc('面板初始状态是否展开')
			.addToggle(toggle => toggle
				.setValue(settings.ui.notePanel.defaultExpanded)
				.onChange(async (value) => {
					settings.ui.notePanel.defaultExpanded = value;
					await this.plugin.saveSettings();
				})
			);
	}

	private renderPhaseList(containerEl: HTMLElement, settings: PluginSettings): void {
		const listEl = containerEl.createDiv({ cls: 'tm-settings-phase-list' });

		for (const phase of settings.phases) {
			const phaseEl = listEl.createDiv({ cls: 'tm-settings-phase-item' });

			new Setting(phaseEl)
				.setName(phase.label + (phase.autoDetected ? ' (auto)' : ''))
				.setDesc(`ID: ${phase.id}` + (phase.noteFilePath ? ` | ${phase.noteFilePath}` : ''))
				.addButton(btn => btn
					.setButtonText('删除')
					.setWarning()
					.onClick(async () => {
						if (phase.autoDetected) {
							new Notice('自动检测的阶段会在下次扫描时重新出现，除非移除笔记中的 phase frontmatter。');
						}
						settings.phases = settings.phases.filter(p => p.id !== phase.id);
						await this.plugin.saveSettings();
						this.display();
					})
				);

			new Setting(phaseEl)
				.setName('描述')
				.addTextArea(text => text
					.setPlaceholder('阶段描述（可选）')
					.setValue(phase.description ?? '')
					.onChange(async (value) => {
						phase.description = value || undefined;
						await this.plugin.saveSettings();
					})
				);
		}

		// Add new phase
		const addEl = containerEl.createDiv({ cls: 'tm-settings-add-phase' });
		let newId = '';
		let newLabel = '';
		let newDesc = '';

		new Setting(addEl)
			.setName('添加新阶段')
			.addText(text => text
				.setPlaceholder('阶段ID (如 mvp)')
				.onChange(value => { newId = value; })
			)
			.addText(text => text
				.setPlaceholder('显示名称 (如 MVP阶段)')
				.onChange(value => { newLabel = value; })
			)
			.addButton(btn => btn
				.setButtonText('添加')
				.setCta()
				.onClick(async () => {
					if (!newId || !newLabel) return;
					const validation = this.viewRegistry.isValidPhaseId(newId);
					if (!validation.valid) {
						new Notice(`无效的阶段ID: ${validation.reason}`);
						return;
					}
					settings.phases.push({
						id: newId,
						label: newLabel,
						order: settings.phases.length,
						description: newDesc || undefined,
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		new Setting(addEl)
			.setName('阶段描述')
			.addTextArea(text => text
				.setPlaceholder('阶段描述（可选）')
				.onChange(value => { newDesc = value; })
			);
	}
}
