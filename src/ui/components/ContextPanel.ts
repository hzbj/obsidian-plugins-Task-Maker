import { App, setIcon } from 'obsidian';
import { Task, QuadrantCode, PluginSettings, PhaseDefinition } from '../../models/types';
import { QUADRANT_CODES } from '../../models/constants';
import { TimeTreeService } from '../../services/TimeTreeService';
import { TagManagerService } from '../../services/TagManagerService';
import { EventBus } from '../../services/EventBus';

export class ContextPanel {
	el: HTMLElement;
	private contentEl: HTMLElement;
	private expandedPhases: Set<string> = new Set();

	constructor(
		private container: HTMLElement,
		private timeTree: TimeTreeService,
		private eventBus: EventBus,
		private app: App,
		private tagManager: TagManagerService,
		private settings: PluginSettings
	) {
		this.el = container.createDiv({ cls: 'tm-context-panel' });
		this.contentEl = this.el.createDiv({ cls: 'tm-context-content' });
	}

	/**
	 * Render phase overview in week view.
	 * Shows each phase's name, description, progress, and expandable task details.
	 */
	render(currentViewId: string, allTasks: Task[]): void {
		this.contentEl.empty();
		this.el.style.display = 'none';

		const phases = this.settings.phases;
		if (phases.length === 0) return;

		this.el.style.display = 'block';

		// Header
		const header = this.contentEl.createDiv({ cls: 'tm-context-header' });
		header.textContent = '阶段概览';

		// Collapse/expand toggle
		let collapsed = false;
		header.addEventListener('click', () => {
			collapsed = !collapsed;
			phasesContainer.style.display = collapsed ? 'none' : 'block';
			header.classList.toggle('tm-collapsed', collapsed);
		});

		const phasesContainer = this.contentEl.createDiv({ cls: 'tm-context-phases' });

		for (const phase of phases.sort((a, b) => a.order - b.order)) {
			this.renderPhaseCard(phasesContainer, phase, allTasks);
		}
	}

	private renderPhaseCard(
		container: HTMLElement,
		phase: PhaseDefinition,
		allTasks: Task[]
	): void {
		const card = container.createDiv({ cls: 'tm-context-phase-card' });

		// Phase name — clickable to navigate to phase view
		const nameEl = card.createDiv({ cls: 'tm-context-phase-name' });
		nameEl.textContent = phase.label;
		nameEl.addEventListener('click', () => {
			this.eventBus.emit('view-switched', {
				viewId: phase.id,
				viewType: 'phase',
			});
		});

		// Phase description
		if (phase.description) {
			const descEl = card.createDiv({ cls: 'tm-context-phase-description' });
			descEl.textContent = phase.description;
		}

		// Compute stats for this phase
		const grouped: Record<QuadrantCode, Task[]> = {
			ui: [], in: [], un: [], nn: [],
		};
		let totalAll = 0;
		let completedAll = 0;

		for (const task of allTasks) {
			const q = task.quadrantAssignments[phase.id];
			if (q && grouped[q]) {
				grouped[q].push(task);
				totalAll++;
				if (task.completed) completedAll++;
			} else if (phase.noteFilePath && task.filePath === phase.noteFilePath) {
				// Task from phase note without quadrant assignment - count in total
				totalAll++;
				if (task.completed) completedAll++;
			}
		}

		// Overall progress
		if (totalAll > 0) {
			const progressRow = card.createDiv({ cls: 'tm-context-phase-progress' });
			const countText = progressRow.createSpan({ cls: 'tm-context-phase-count' });
			countText.textContent = `${completedAll}/${totalAll}`;

			const barContainer = progressRow.createDiv({ cls: 'tm-context-bar' });
			const barFill = barContainer.createDiv({ cls: 'tm-context-bar-fill' });
			barFill.style.width = `${(completedAll / totalAll) * 100}%`;
		}

		// Quadrant mini-summary
		const hasAnyTasks = totalAll > 0;
		if (hasAnyTasks) {
			const summaryEl = card.createDiv({ cls: 'tm-context-summary' });
			for (const code of QUADRANT_CODES) {
				const tasks = grouped[code];
				if (tasks.length === 0) continue;
				const completed = tasks.filter(t => t.completed).length;

				const cell = summaryEl.createDiv({ cls: `tm-context-cell tm-context-${code}` });
				cell.style.setProperty('--tm-quadrant-color', this.settings.ui.quadrantColors[code]);

				const label = cell.createDiv({ cls: 'tm-context-label' });
				label.textContent = this.settings.ui.quadrantLabels[code];

				const count = cell.createDiv({ cls: 'tm-context-count' });
				count.textContent = `${completed}/${tasks.length}`;
			}
		}

		// Toggle button for task details
		if (hasAnyTasks) {
			const isExpanded = this.expandedPhases.has(phase.id);
			const detailsContainer = card.createDiv({ cls: 'tm-context-phase-details' });
			detailsContainer.style.display = isExpanded ? 'block' : 'none';

			const toggleBtn = card.createEl('button', { cls: 'tm-context-phase-toggle' });
			const iconSpan = toggleBtn.createSpan({ cls: 'tm-toggle-icon' });
			const labelSpan = toggleBtn.createSpan();

			const updateToggle = (expanded: boolean) => {
				iconSpan.empty();
				setIcon(iconSpan, expanded ? 'chevron-up' : 'chevron-down');
				labelSpan.textContent = expanded ? '收起任务' : '查看任务';
			};
			updateToggle(isExpanded);

			toggleBtn.addEventListener('click', () => {
				const nowExpanded = this.expandedPhases.has(phase.id);
				if (nowExpanded) {
					this.expandedPhases.delete(phase.id);
					detailsContainer.style.display = 'none';
				} else {
					this.expandedPhases.add(phase.id);
					detailsContainer.style.display = 'block';
				}
				updateToggle(!nowExpanded);
			});

			// Pre-render details (hidden by default)
			this.renderPhaseDetails(detailsContainer, phase, grouped);
		}
	}

	private renderPhaseDetails(
		container: HTMLElement,
		phase: PhaseDefinition,
		grouped: Record<QuadrantCode, Task[]>
	): void {
		for (const code of QUADRANT_CODES) {
			const tasks = grouped[code];
			if (tasks.length === 0) continue;

			const group = container.createDiv({ cls: 'tm-context-detail-group' });

			// Group header with quadrant color
			const header = group.createDiv({ cls: 'tm-context-detail-header' });
			header.style.setProperty('--tm-quadrant-color', this.settings.ui.quadrantColors[code]);
			header.textContent = `${this.settings.ui.quadrantLabels[code]} (${tasks.length})`;

			// Task items
			for (const task of tasks) {
				this.renderDetailTaskItem(group, task);
			}
		}
	}

	private renderDetailTaskItem(container: HTMLElement, task: Task): void {
		const item = container.createDiv({ cls: 'tm-context-detail-item' });
		if (task.completed) {
			item.classList.add('tm-context-detail-completed');
		}

		// Checkbox
		const checkbox = item.createEl('input', {
			type: 'checkbox',
			cls: 'tm-context-detail-checkbox',
		});
		checkbox.checked = task.completed;
		checkbox.addEventListener('change', async () => {
			const success = await this.tagManager.toggleTaskCompletion(task);
			if (success) {
				this.eventBus.emit('task-toggled', {
					taskId: task.id,
					completed: !task.completed,
				});
			}
		});

		// Task text
		const textEl = item.createSpan({ cls: 'tm-context-detail-text' });
		textEl.textContent = task.text;

		// Source file link
		const fileName = task.filePath.split('/').pop() ?? task.filePath;
		const sourceEl = item.createSpan({ cls: 'tm-context-detail-source' });
		sourceEl.textContent = fileName;
		sourceEl.addEventListener('click', (e) => {
			e.stopPropagation();
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (file) {
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(file as any, {
					eState: { line: task.lineNumber },
				});
			}
		});
	}
}
