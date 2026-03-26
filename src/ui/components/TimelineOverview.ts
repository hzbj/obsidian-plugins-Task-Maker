import { PhaseDefinition, PluginSettings } from '../../models/types';
import { EventBus } from '../../services/EventBus';

const TIMELINE_COLORS = [
	'#3498db', '#e74c3c', '#2ecc71', '#f39c12',
	'#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

export class TimelineOverview {
	el: HTMLElement;

	private headerRangeEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;

	constructor(
		container: HTMLElement,
		private getSettings: () => PluginSettings,
		private eventBus: EventBus
	) {
		this.el = container.createDiv({ cls: 'tm-timeline-container' });
		this.el.style.display = 'none';
	}

	show(): void {
		this.el.style.display = 'flex';
	}

	hide(): void {
		this.el.style.display = 'none';
	}

	render(phases: PhaseDefinition[]): void {
		this.el.empty();

		// Header
		const header = this.el.createDiv({ cls: 'tm-timeline-header' });
		header.createSpan({ cls: 'tm-timeline-title', text: '\u9879\u76EE\u65F6\u95F4\u8F74' });
		this.headerRangeEl = header.createSpan({ cls: 'tm-timeline-range' });

		// Body
		this.bodyEl = this.el.createDiv({ cls: 'tm-timeline-body' });

		// Filter phases with valid timePeriod
		const validPhases = phases
			.filter(p => p.timePeriod && this.parseDate(p.timePeriod.start) && this.parseDate(p.timePeriod.end))
			.sort((a, b) => a.order - b.order);

		if (validPhases.length === 0) {
			this.renderEmpty();
			return;
		}

		// Calculate project range
		let projectStart: Date | null = null;
		let projectEnd: Date | null = null;

		for (const p of validPhases) {
			const s = this.parseDate(p.timePeriod!.start)!;
			const e = this.parseDate(p.timePeriod!.end)!;
			if (!projectStart || s < projectStart) projectStart = s;
			if (!projectEnd || e > projectEnd) projectEnd = e;
		}

		if (!projectStart || !projectEnd) {
			this.renderEmpty();
			return;
		}

		const totalDays = this.daysBetween(projectStart, projectEnd);
		if (totalDays <= 0) {
			this.headerRangeEl.textContent = this.formatDate(projectStart);
		} else {
			this.headerRangeEl.textContent = `${this.formatDate(projectStart)} \u2014 ${this.formatDate(projectEnd)}`;
		}

		// Today percentage (shared across all rows)
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayPct = totalDays > 0
			? (this.daysBetween(projectStart, today) / totalDays) * 100
			: -1;

		// Rows
		const rows = this.bodyEl.createDiv({ cls: 'tm-timeline-rows' });

		for (let i = 0; i < validPhases.length; i++) {
			const phase = validPhases[i];
			const phaseStart = this.parseDate(phase.timePeriod!.start)!;
			const phaseEnd = this.parseDate(phase.timePeriod!.end)!;
			const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];

			const leftPct = totalDays > 0
				? (this.daysBetween(projectStart, phaseStart) / totalDays) * 100
				: 0;
			const widthPct = totalDays > 0
				? (this.daysBetween(phaseStart, phaseEnd) / totalDays) * 100
				: 100;

			const row = rows.createDiv({ cls: 'tm-timeline-row' });

			// Label
			const label = row.createSpan({ cls: 'tm-timeline-row-label', text: phase.label });
			label.title = phase.label;

			// Start date
			row.createSpan({ cls: 'tm-timeline-row-date', text: phase.timePeriod!.start });

			// Track + bar + today cursor (same pattern as InlineTimeline)
			const track = row.createDiv({ cls: 'tm-timeline-row-track' });
			const bar = track.createDiv({ cls: 'tm-timeline-row-bar' });
			bar.style.left = `${Math.max(0, leftPct)}%`;
			bar.style.width = `${Math.max(0.5, widthPct)}%`;
			bar.style.background = color;

			// Today cursor directly inside each track
			if (todayPct >= 0 && todayPct <= 100) {
				const cursor = track.createDiv({ cls: 'tm-timeline-today-cursor' });
				cursor.style.left = `${todayPct}%`;
				// Only show label on first row to avoid clutter
				if (i === 0) {
					const cursorLabel = cursor.createDiv({ cls: 'tm-timeline-today-cursor-label' });
					cursorLabel.textContent = '\u4ECA\u5929';
				}
			}

			// End date
			row.createSpan({ cls: 'tm-timeline-row-date', text: phase.timePeriod!.end });

			// Click to navigate to this phase's matrix view
			row.addEventListener('click', () => {
				this.eventBus.emit('timeline-toggled', { active: false });
				this.eventBus.emit('view-switched', { viewId: phase.id, viewType: 'phase' });
			});
		}
	}

	destroy(): void {
		this.el.remove();
	}

	private renderEmpty(): void {
		if (!this.bodyEl) return;
		this.headerRangeEl!.textContent = '';
		const empty = this.bodyEl.createDiv({ cls: 'tm-timeline-empty' });
		empty.textContent = '\u6682\u65E0\u9636\u6BB5\u914D\u7F6E\u4E86\u65F6\u95F4\u8303\u56F4\u3002\u8BF7\u5728\u9636\u6BB5\u7B14\u8BB0\u7684 frontmatter \u4E2D\u6DFB\u52A0 phase-start \u548C phase-end \u5C5E\u6027\u3002';
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

	private formatDate(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}
}
