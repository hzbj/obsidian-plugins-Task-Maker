import { PluginSettings } from '../../models/types';
import { EventBus } from '../../services/EventBus';

const TIMELINE_COLORS = [
	'#3498db', '#e74c3c', '#2ecc71', '#f39c12',
	'#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

export class InlineTimeline {
	el: HTMLElement;

	constructor(
		container: HTMLElement,
		private getSettings: () => PluginSettings,
		private eventBus: EventBus
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

		// 阶段进度条
		const bar = track.createDiv({ cls: 'tm-inline-timeline-bar' });
		bar.style.background = color;

		// 今天光标
		if (totalDays > 0) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
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
	}

	destroy(): void {
		this.el.remove();
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
}
