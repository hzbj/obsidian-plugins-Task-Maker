import { Task, QuadrantCode, PluginSettings, TimeNodeType } from '../../models/types';
import { QUADRANT_CODES } from '../../models/constants';
import { TimeTreeService } from '../../services/TimeTreeService';

export class ContextPanel {
	el: HTMLElement;
	private contentEl: HTMLElement;

	constructor(
		private container: HTMLElement,
		private timeTree: TimeTreeService,
		private settings: PluginSettings
	) {
		this.el = container.createDiv({ cls: 'tm-context-panel' });
		this.contentEl = this.el.createDiv({ cls: 'tm-context-content' });
	}

	/**
	 * Render the parent-level task summary for context awareness.
	 * Shows the parent view's quadrant distribution.
	 */
	render(currentViewId: string, allTasks: Task[]): void {
		this.contentEl.empty();
		this.el.style.display = 'none';

		const parentNode = this.timeTree.getParent(currentViewId);
		if (!parentNode) return; // Top level or phase view - no context

		this.el.style.display = 'block';

		// Header
		const header = this.contentEl.createDiv({ cls: 'tm-context-header' });
		header.textContent = `${parentNode.label} 概览`;

		// Collapse/expand toggle
		let collapsed = false;
		header.addEventListener('click', () => {
			collapsed = !collapsed;
			summaryEl.style.display = collapsed ? 'none' : 'grid';
			header.classList.toggle('tm-collapsed', collapsed);
		});

		// Compute stats for parent view
		const parentViewId = parentNode.viewId;
		const stats: Record<QuadrantCode, { total: number; completed: number }> = {
			ui: { total: 0, completed: 0 },
			in: { total: 0, completed: 0 },
			un: { total: 0, completed: 0 },
			nn: { total: 0, completed: 0 },
		};

		for (const task of allTasks) {
			const q = task.quadrantAssignments[parentViewId];
			if (q && stats[q]) {
				stats[q].total++;
				if (task.completed) stats[q].completed++;
			}
		}

		// Render summary grid
		const summaryEl = this.contentEl.createDiv({ cls: 'tm-context-summary' });

		for (const code of QUADRANT_CODES) {
			const s = stats[code];
			const cell = summaryEl.createDiv({ cls: `tm-context-cell tm-context-${code}` });
			cell.style.setProperty('--tm-quadrant-color', this.settings.ui.quadrantColors[code]);

			const label = cell.createDiv({ cls: 'tm-context-label' });
			label.textContent = this.settings.ui.quadrantLabels[code];

			const count = cell.createDiv({ cls: 'tm-context-count' });
			count.textContent = `${s.completed}/${s.total}`;

			// Progress bar
			if (s.total > 0) {
				const barContainer = cell.createDiv({ cls: 'tm-context-bar' });
				const barFill = barContainer.createDiv({ cls: 'tm-context-bar-fill' });
				barFill.style.width = `${(s.completed / s.total) * 100}%`;
			}
		}
	}
}
