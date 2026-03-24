import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { PluginSettings, PhaseDefinition, CategoryPreset } from '../models/types';
import { ViewRegistryService } from '../services/ViewRegistryService';
import { EventBus } from '../services/EventBus';
import { TimeBlocksSyncService } from '../services/TimeBlocksSyncService';
import { CreatePhaseModal } from '../ui/components/CreatePhaseModal';
import type TaskMakerPlugin from '../main';

export class SettingsTab extends PluginSettingTab {
	private timeBlocksSync: TimeBlocksSyncService;

	constructor(
		app: App,
		private plugin: TaskMakerPlugin,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus,
		timeBlocksSync?: TimeBlocksSyncService
	) {
		super(app, plugin);
		this.timeBlocksSync = timeBlocksSync || new TimeBlocksSyncService(app, () => plugin.settings);
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

		// ─── Category Management ───
		containerEl.createEl('h2', { text: '分类管理' });
		this.renderTimeBlocksSync(containerEl, settings);
		this.renderCategoryList(containerEl, settings);

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

		new Setting(containerEl)
			.setName('周报笔记格式')
			.setDesc('Moment.js 日期格式。推荐 GGGG[W]WW（ISO 周年+周数），如 2026W11')
			.addText(text => text
				.setValue(patterns.week)
				.setPlaceholder('GGGG[W]WW')
				.onChange(async (value) => {
					patterns.week = value;
					await this.plugin.saveSettings();
				})
			);

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

	private async renderTimeBlocksSync(containerEl: HTMLElement, settings: PluginSettings): Promise<void> {
		const isAvailable = await this.timeBlocksSync.isAvailable();
		
		if (!isAvailable) {
			const descEl = containerEl.createEl('p', { 
				text: '未检测到 time-blocks 插件数据（time-blocks-data/index.json 不存在）',
				cls: 'tm-sync-not-available'
			});
			descEl.style.color = 'var(--text-muted)';
			descEl.style.fontSize = '0.9em';
			return;
		}

		const syncContainer = containerEl.createDiv({ cls: 'tm-timeblocks-sync' });
		
		new Setting(syncContainer)
			.setName('从 Time Blocks 同步分类')
			.setDesc('同步 time-blocks 插件中的分类设置到当前插件')
			.addButton(btn => btn
				.setButtonText('预览同步')
				.onClick(async () => {
					const result = await this.timeBlocksSync.previewSync();
					if (result.success) {
						const catList = result.categories.map(c => `• ${c.name} (${c.color})`).join('\n');
						new Notice(`找到以下分类:\n${catList}`, 5000);
					} else {
						new Notice(result.message);
					}
				})
			)
			.addButton(btn => btn
				.setButtonText('合并同步')
				.setCta()
				.onClick(async () => {
					const result = await this.timeBlocksSync.syncCategories('merge');
					new Notice(result.message);
					if (result.success) {
						await this.plugin.saveSettings();
						this.display();
					}
				})
			)
			.addButton(btn => btn
				.setButtonText('完全替换')
				.setWarning()
				.onClick(async () => {
					if (!confirm('确定要完全替换现有分类吗？这将删除所有现有分类。')) {
						return;
					}
					const result = await this.timeBlocksSync.syncCategories('replace');
					new Notice(result.message);
					if (result.success) {
						await this.plugin.saveSettings();
						this.display();
					}
				})
			);
	}

	private renderCategoryList(containerEl: HTMLElement, settings: PluginSettings): void {
		const listEl = containerEl.createDiv({ cls: 'tm-settings-category-list' });

		for (const cat of settings.categories) {
			const catEl = listEl.createDiv({ cls: 'tm-settings-category-item' });

			const setting = new Setting(catEl);
			// Color dot + name
			const nameFragment = createFragment(frag => {
				const dot = frag.createSpan({ cls: 'tm-color-dot' });
				dot.style.backgroundColor = cat.color;
				frag.appendText(cat.name);
			});
			setting.nameEl.empty();
			setting.nameEl.appendChild(nameFragment);
			setting.setDesc(`ID: ${cat.id}`);

			setting.addColorPicker(picker => picker
				.setValue(cat.color)
				.onChange(async (value) => {
					cat.color = value;
					await this.plugin.saveSettings();
					this.display();
				})
			);

			setting.addButton(btn => btn
				.setButtonText('删除')
				.setWarning()
				.onClick(async () => {
					settings.categories = settings.categories.filter(c => c.id !== cat.id);
					await this.plugin.saveSettings();
					this.display();
				})
			);
		}

		// Add new category
		const addEl = containerEl.createDiv({ cls: 'tm-settings-add-category' });
		let newCatId = '';
		let newCatName = '';
		let newCatColor = '#4a9eff';

		new Setting(addEl)
			.setName('添加新分类')
			.addText(text => text
				.setPlaceholder('分类ID (如 work)')
				.onChange(value => { newCatId = value; })
			)
			.addText(text => text
				.setPlaceholder('显示名称 (如 工作)')
				.onChange(value => { newCatName = value; })
			)
			.addColorPicker(picker => picker
				.setValue(newCatColor)
				.onChange(value => { newCatColor = value; })
			)
			.addButton(btn => btn
				.setButtonText('添加')
				.setCta()
				.onClick(async () => {
					const id = newCatId.trim();
					const name = newCatName.trim();
					if (!id || !name) {
						new Notice('分类ID和名称不能为空');
						return;
					}
					if (!/^[a-zA-Z0-9_]+$/.test(id)) {
						new Notice('分类ID只能包含字母、数字和下划线');
						return;
					}
					if (settings.categories.some(c => c.id === id)) {
						new Notice(`分类ID "${id}" 已存在`);
						return;
					}
					if (/[\s#]/.test(name)) {
						new Notice('分类名称不能包含空格或 # 号');
						return;
					}
					settings.categories.push({ id, name, color: newCatColor });
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}
}
