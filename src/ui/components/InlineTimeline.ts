import { PluginSettings, SubdivisionUnit, PhaseSubdivision, PhaseDefinition } from '../../models/types';
import { EventBus } from '../../services/EventBus';
import { Menu } from 'obsidian';

const TIMELINE_COLORS = [
	'#3498db', '#e74c3c', '#2ecc71', '#f39c12',
	'#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

export class InlineTimeline {
	el: HTMLElement;
	private currentPhaseId: string = '';

	constructor(
		container: HTMLElement,
		private getSettings: () => PluginSettings,
		private eventBus: EventBus,
		private saveSettings: () => Promise<void>
	) {
		this.el = container.createDiv({ cls: 'tm-inline-timeline' });
		this.el.style.display = 'none';
	}

	show(): void {
		this.el.style.display = 'flex';
	}

	hide(): void {
		this.el.style.display = 'none';
	}

	render(currentPhaseId: string): void {
		this.el.empty();
		this.currentPhaseId = currentPhaseId;

		const phases = this.getSettings().phases;
		const phase = phases.find(p => p.id === currentPhaseId);

		if (!phase || !phase.timePeriod) {
			this.el.style.display = 'none';
			return;
		}

		const start = this.parseDate(phase.timePeriod.start);
		const end = this.parseDate(phase.timePeriod.end);

		if (!start || !end) {
			this.el.style.display = 'none';
			return;
		}

		this.el.style.display = 'flex';

		const totalDays = this.daysBetween(start, end);

		// 阶段状态判断
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const daysToEnd = this.daysBetween(today, end);
		const deadlineWarningDays = this.getSettings().ui.deadlineWarningDays || 7;

		// 情况1：阶段已结束
		if (daysToEnd < 0) {
			this.el.createSpan({ cls: 'tm-inline-timeline-date', text: phase.timePeriod.start });
			const endedBadge = this.el.createDiv({ cls: 'tm-phase-ended-badge' });
			endedBadge.textContent = `阶段已结束 ${Math.abs(daysToEnd)} 天`;
			this.el.createSpan({ cls: 'tm-inline-timeline-date', text: phase.timePeriod.end });
			return;
		}


		// 确定当前阶段的颜色
		const sortedPhases = [...phases]
			.filter(p => p.timePeriod && this.parseDate(p.timePeriod.start) && this.parseDate(p.timePeriod.end))
			.sort((a, b) => a.order - b.order);
		const colorIndex = sortedPhases.findIndex(p => p.id === currentPhaseId);
		const color = TIMELINE_COLORS[(colorIndex >= 0 ? colorIndex : 0) % TIMELINE_COLORS.length];

		// 左侧开始日期
		this.el.createSpan({ cls: 'tm-inline-timeline-date', text: phase.timePeriod.start });

		// 轨道
		const track = this.el.createDiv({ cls: 'tm-inline-timeline-track' });

		// 细分阶段容器（在轨道上方）- 只创建有效的细分
		const validSubdivisions = phase.customSubdivisions?.filter(sub => sub.start && sub.end) || [];
		if (validSubdivisions.length > 0 && totalDays > 0) {
			const subdivisionContainer = track.createDiv({ cls: 'tm-inline-timeline-subdivision-container' });
			subdivisionContainer.createDiv({ cls: 'tm-inline-timeline-subdivision-baseline' });

			for (const sub of validSubdivisions) {
				const subStart = this.parseDate(sub.start);
				const subEnd = this.parseDate(sub.end);
				if (!subStart || !subEnd) continue;

				const startPct = (this.daysBetween(start, subStart) / totalDays) * 100;
				const endPct = (this.daysBetween(start, subEnd) / totalDays) * 100;
				const widthPct = endPct - startPct;

				if (widthPct > 0) {
					const bar = subdivisionContainer.createDiv({ cls: 'tm-inline-timeline-subdivision-bar' });
					// 留出间隙：左右各减 1%
					bar.style.left = `calc(${startPct}% + 1px)`;
					bar.style.width = `calc(${widthPct}% - 2px)`;

					// 创建 tooltip
					const tooltip = bar.createDiv({ cls: 'tm-subdivision-tooltip' });
					const dateRange = `${sub.start} — ${sub.end}`;
					tooltip.textContent = sub.description ? `${dateRange}: ${sub.description}` : dateRange;
				}
			}
		}

		// 阶段进度条
		const bar = track.createDiv({ cls: 'tm-inline-timeline-bar' });
		bar.style.background = color;

		// 确定细分单位
		const unit = phase.subdivisionUnit || this.getSettings().defaultSubdivisionUnit || 'week';

		// 渲染自动细分标记线
		if (totalDays > 0) {
			const subdivisionDates = this.generateSubdivisionDates(start, end, unit);
			for (let idx = 0; idx < subdivisionDates.length; idx++) {
				const date = subdivisionDates[idx];
				const pct = (this.daysBetween(start, date) / totalDays) * 100;
				const line = track.createDiv({ cls: 'tm-inline-timeline-subdivision-line' });
				line.style.left = `${pct}%`;
				line.title = this.formatDate(date);

				// 周期标识标签
				const label = line.createDiv({ cls: 'tm-inline-timeline-subdivision-label' });
				label.textContent = this.getSubdivisionLabel(unit, idx);
			}
		}

		// 今天光标
		if (totalDays > 0) {
			const todayPct = (this.daysBetween(start, today) / totalDays) * 100;

			if (todayPct >= 0 && todayPct <= 100) {
				const cursor = track.createDiv({ cls: 'tm-inline-timeline-cursor' });
				cursor.style.left = `${todayPct}%`;

				const cursorLabel = cursor.createDiv({ cls: 'tm-inline-timeline-cursor-label' });
				cursorLabel.textContent = '\u4ECA\u5929';
			}
		}

		// 右侧结束日期
		this.el.createSpan({ cls: 'tm-inline-timeline-date', text: phase.timePeriod.end });

		// 即将到期警告标签
		if (daysToEnd >= 0 && daysToEnd <= deadlineWarningDays) {
			const warningBadge = this.el.createSpan({ cls: 'tm-phase-warning-badge' });
			warningBadge.textContent = `还有 ${daysToEnd} 天到期`;
		}

		// 右键菜单 - 细分阶段管理
		track.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const menu = new Menu();

			// 1. 设置细分单位
			const units: { value: SubdivisionUnit; label: string }[] = [
				{ value: 'week', label: '按周' },
				{ value: 'biweek', label: '按双周' },
				{ value: 'month', label: '按月' },
				{ value: 'day', label: '按天' },
			];

			for (const u of units) {
				menu.addItem(item => item
					.setTitle(`细分单位: ${u.label}${phase.subdivisionUnit === u.value ? ' ✓' : ''}`)
					.onClick(async () => {
						phase.subdivisionUnit = u.value;
						await this.saveSettings();
					}));
			}

			menu.addSeparator();

			// 2. 新建细分阶段计划
			menu.addItem(item => item
				.setTitle('新建细分阶段计划')
				.onClick(async () => {
					const newSub: PhaseSubdivision = {
						id: Date.now().toString(36),
						start: '',
						end: '',
						description: '',
					};
					if (!phase.customSubdivisions) {
						phase.customSubdivisions = [];
					}
					phase.customSubdivisions.push(newSub);
					await this.saveSettings();
					this.showSubdivisionEditor(phase, newSub);
				}));

			// 3. 已有细分段的编辑和删除
			if (phase.customSubdivisions && phase.customSubdivisions.length > 0) {
				menu.addSeparator();
				for (const sub of phase.customSubdivisions) {
					const subLabel = `${sub.start} — ${sub.end}${sub.description ? ': ' + sub.description : ''}`;
					
					menu.addItem(item => item
						.setTitle(`编辑: ${subLabel}`)
						.onClick(() => {
							this.showSubdivisionEditor(phase, sub);
						}));
					
					menu.addItem(item => item
						.setTitle(`删除: ${subLabel}`)
						.setWarning(true)
						.onClick(async () => {
							if (phase.customSubdivisions) {
								phase.customSubdivisions = phase.customSubdivisions.filter(s => s.id !== sub.id);
								await this.saveSettings();
							}
						}));
				}
			}

			menu.showAtMouseEvent(e);
		});
	}

	destroy(): void {
		this.el.remove();
	}

	private showSubdivisionEditor(phase: PhaseDefinition, sub: PhaseSubdivision): void {
		// 移除已有的编辑器
		const existing = document.querySelector('.tm-subdivision-editor');
		if (existing) existing.remove();

		const editor = document.createElement('div');
		editor.className = 'tm-subdivision-editor';
		
		// 标题
		const title = editor.createEl('div', { cls: 'tm-subdivision-editor-title', text: '编辑细分阶段' });
		
		// 开始日期
		const startGroup = editor.createEl('div', { cls: 'tm-subdivision-editor-field' });
		startGroup.createEl('label', { text: '开始日期' });
		const startInput = startGroup.createEl('input', { type: 'text', value: sub.start, placeholder: 'YYYY-MM-DD' });
		
		// 结束日期
		const endGroup = editor.createEl('div', { cls: 'tm-subdivision-editor-field' });
		endGroup.createEl('label', { text: '结束日期' });
		const endInput = endGroup.createEl('input', { type: 'text', value: sub.end, placeholder: 'YYYY-MM-DD' });
		
		// 描述
		const descGroup = editor.createEl('div', { cls: 'tm-subdivision-editor-field' });
		descGroup.createEl('label', { text: '描述' });
		const descInput = descGroup.createEl('input', { type: 'text', value: sub.description || '', placeholder: '阶段描述...' });
		
		// 按钮区
		const btnGroup = editor.createEl('div', { cls: 'tm-subdivision-editor-buttons' });
		
		const saveBtn = btnGroup.createEl('button', { text: '保存', cls: 'mod-cta' });
		saveBtn.addEventListener('click', async () => {
			sub.start = startInput.value;
			sub.end = endInput.value;
			sub.description = descInput.value || undefined;
			await this.saveSettings();
			editor.remove();
			// 重新渲染时间轴以显示新保存的细分阶段
			if (this.currentPhaseId) {
				this.render(this.currentPhaseId);
			}
		});
		
		const cancelBtn = btnGroup.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			editor.remove();
		});
		
		// 定位到时间轴附近
		document.body.appendChild(editor);
		const rect = this.el.getBoundingClientRect();
		editor.style.position = 'fixed';
		editor.style.top = `${rect.bottom + 4}px`;
		editor.style.left = `${rect.left}px`;
		editor.style.zIndex = '1000';
		
		// 点击外部关闭
		const closeOnOutsideClick = (e: MouseEvent) => {
			if (!editor.contains(e.target as Node)) {
				editor.remove();
				document.removeEventListener('mousedown', closeOnOutsideClick);
			}
		};
		setTimeout(() => document.addEventListener('mousedown', closeOnOutsideClick), 100);
	}

	private parseDate(str: string): Date | null {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
		const [y, m, d] = str.split('-').map(Number);
		const date = new Date(y, m - 1, d);
		if (isNaN(date.getTime())) return null;
		return date;
	}

	private daysBetween(a: Date, b: Date): number {
		return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
	}

	private generateSubdivisionDates(start: Date, end: Date, unit: SubdivisionUnit): Date[] {
		const dates: Date[] = [];
		const startTime = start.getTime();
		const endTime = end.getTime();

		// Skip if range is invalid
		if (startTime >= endTime) return dates;

		const current = new Date(start);

		switch (unit) {
			case 'day': {
				// Add every day between start and end (exclusive)
				current.setDate(current.getDate() + 1);
				while (current.getTime() < endTime) {
					dates.push(new Date(current));
					current.setDate(current.getDate() + 1);
				}
				break;
			}
			case 'week': {
				// Add every 7 days from start
				current.setDate(current.getDate() + 7);
				while (current.getTime() < endTime) {
					dates.push(new Date(current));
					current.setDate(current.getDate() + 7);
				}
				break;
			}
			case 'biweek': {
				// Add every 14 days from start
				current.setDate(current.getDate() + 14);
				while (current.getTime() < endTime) {
					dates.push(new Date(current));
					current.setDate(current.getDate() + 14);
				}
				break;
			}
			case 'month': {
				// Add same day each month (or last day if exceeds)
				const startDay = start.getDate();
				current.setMonth(current.getMonth() + 1);
				while (current.getTime() < endTime) {
					// Handle month end (e.g., Jan 31 -> Feb 28/29)
					const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
					if (startDay > daysInMonth) {
						current.setDate(daysInMonth);
					} else {
						current.setDate(startDay);
					}
					if (current.getTime() < endTime) {
						dates.push(new Date(current));
					}
					current.setMonth(current.getMonth() + 1);
				}
				break;
			}
		}

		return dates;
	}

	private formatDate(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	private getSubdivisionLabel(unit: SubdivisionUnit, index: number): string {
		switch (unit) {
			case 'day': return `D${index + 1}`;
			case 'week': return `W${index + 1}`;
			case 'biweek': return `B${index + 1}`;
			case 'month': return `M${index + 1}`;
			default: return `${index + 1}`;
		}
	}
}
