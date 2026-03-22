import { App, PluginSettingTab, Setting } from 'obsidian';
import { PluginSettings, PhaseDefinition, TimeNodeType } from '../models/types';
import { ViewRegistryService } from '../services/ViewRegistryService';
import { EventBus } from '../services/EventBus';
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
		this.renderPhaseList(containerEl, settings);

		// ─── Time View ───
		containerEl.createEl('h2', { text: '时间视图设置' });
		new Setting(containerEl)
			.setName('起始年份')
			.addText(text => text
				.setValue(String(settings.timeView.startYear))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 2000 && num < 2100) {
						settings.timeView.startYear = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('结束年份')
			.addText(text => text
				.setValue(String(settings.timeView.endYear))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 2000 && num < 2100) {
						settings.timeView.endYear = num;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('每周起始日')
			.addDropdown(dropdown => dropdown
				.addOption('1', '周一')
				.addOption('0', '周日')
				.setValue(String(settings.timeView.weekStart))
				.onChange(async (value) => {
					settings.timeView.weekStart = parseInt(value) as 0 | 1;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('默认时间层级')
			.addDropdown(dropdown => dropdown
				.addOption('year', '年')
				.addOption('quarter', '季度')
				.addOption('month', '月')
				.addOption('week', '周')
				.setValue(settings.timeView.defaultLevel)
				.onChange(async (value) => {
					settings.timeView.defaultLevel = value as TimeNodeType;
					await this.plugin.saveSettings();
				})
			);

		// ─── Note Association ───
		containerEl.createEl('h2', { text: '笔记关联' });
		new Setting(containerEl)
			.setName('启用笔记关联')
			.addToggle(toggle => toggle
				.setValue(settings.noteAssociation.enabled)
				.onChange(async (value) => {
					settings.noteAssociation.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		const patterns = settings.noteAssociation.timeNotePatterns;
		const patternLabels: Record<TimeNodeType, string> = {
			year: '年度笔记格式',
			quarter: '季度笔记格式',
			month: '月度笔记格式',
			week: '周报笔记格式',
		};

		for (const type of ['year', 'quarter', 'month', 'week'] as TimeNodeType[]) {
			new Setting(containerEl)
				.setName(patternLabels[type])
				.setDesc(`Moment.js 日期格式，用于匹配文件名`)
				.addText(text => text
					.setValue(patterns[type])
					.setPlaceholder(patterns[type])
					.onChange(async (value) => {
						patterns[type] = value;
						await this.plugin.saveSettings();
					})
				);
		}

		new Setting(containerEl)
			.setName('搜索文件夹')
			.setDesc('限定笔记关联搜索的文件夹路径，逗号分隔，留空搜索全库')
			.addText(text => text
				.setValue(settings.noteAssociation.noteSearchFolders.join(', '))
				.onChange(async (value) => {
					settings.noteAssociation.noteSearchFolders = value
						.split(',')
						.map(t => t.trim())
						.filter(t => t.length > 0);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('提取内容标题')
			.setDesc('从关联笔记中提取这些标题下的内容，逗号分隔')
			.addText(text => text
				.setValue(settings.noteAssociation.contentHeadings.join(', '))
				.onChange(async (value) => {
					settings.noteAssociation.contentHeadings = value
						.split(',')
						.map(t => t.trim())
						.filter(t => t.length > 0);
					await this.plugin.saveSettings();
				})
			);

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
	}

	private renderPhaseList(containerEl: HTMLElement, settings: PluginSettings): void {
		const listEl = containerEl.createDiv({ cls: 'tm-settings-phase-list' });

		for (const phase of settings.phases) {
			const phaseEl = listEl.createDiv({ cls: 'tm-settings-phase-item' });

			new Setting(phaseEl)
				.setName(phase.label)
				.setDesc(`ID: ${phase.id}`)
				.addButton(btn => btn
					.setButtonText('删除')
					.setWarning()
					.onClick(async () => {
						settings.phases = settings.phases.filter(p => p.id !== phase.id);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		}

		// Add new phase
		const addEl = containerEl.createDiv({ cls: 'tm-settings-add-phase' });
		let newId = '';
		let newLabel = '';

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
						// Show notice
						const { Notice } = await import('obsidian');
						new Notice(`无效的阶段ID: ${validation.reason}`);
						return;
					}
					settings.phases.push({
						id: newId,
						label: newLabel,
						order: settings.phases.length,
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}
}
