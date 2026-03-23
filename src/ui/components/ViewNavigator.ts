import { ViewType, TimeNodeType } from '../../models/types';
import { EventBus } from '../../services/EventBus';
import { TimeTreeService } from '../../services/TimeTreeService';
import { ViewRegistryService } from '../../services/ViewRegistryService';
import { PhaseSelector } from './PhaseSelector';
import { TimeBreadcrumb } from './TimeBreadcrumb';

export type ViewMode = 'phase' | 'time';

export class ViewNavigator {
	el: HTMLElement;
	private modeTabsEl: HTMLElement;
	private timeControlsEl: HTMLElement;
	private phaseControlsEl: HTMLElement;
	private phaseSelector: PhaseSelector;
	private timeBreadcrumb: TimeBreadcrumb;
	private todayBtn: HTMLElement;
	private scanHostEl: HTMLElement;

	private currentMode: ViewMode = 'time';
	private currentTimeLevel: TimeNodeType = 'week';

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private timeTree: TimeTreeService,
		private eventBus: EventBus,
		private onAddPhase?: () => void
	) {
		this.el = container.createDiv({ cls: 'tm-nav-bar' });

		// Mode tabs
		this.modeTabsEl = this.el.createDiv({ cls: 'tm-mode-tabs' });
		this.createModeTab('time', '周视图');
		this.createModeTab('phase', '阶段视图');

		// Time view controls
		this.timeControlsEl = this.el.createDiv({ cls: 'tm-time-controls' });
		this.timeBreadcrumb = new TimeBreadcrumb(this.timeControlsEl, timeTree, eventBus);

		// Row container for "today" button + scan controls
		const timeActionsEl = this.timeControlsEl.createDiv({ cls: 'tm-time-actions' });

		// "Jump to this week" button
		this.todayBtn = timeActionsEl.createEl('button', {
			cls: 'tm-today-btn',
			text: '本周',
		});
		this.todayBtn.addEventListener('click', () => {
			const viewId = this.timeTree.getCurrentViewId('week');
			this.eventBus.emit('view-switched', { viewId, viewType: 'week' });
		});

		// Scan host container (populated by MatrixView)
		this.scanHostEl = timeActionsEl.createDiv({ cls: 'tm-scan-host' });

		// Phase view controls
		this.phaseControlsEl = this.el.createDiv({ cls: 'tm-phase-controls' });
		this.phaseSelector = new PhaseSelector(this.phaseControlsEl, viewRegistry, eventBus);

		if (this.onAddPhase) {
			const addBtn = this.phaseControlsEl.createEl('button', {
				cls: 'tm-add-phase-btn',
				text: '+',
				attr: { 'aria-label': '新建阶段笔记' },
			});
			addBtn.addEventListener('click', () => this.onAddPhase!());
		}

		this.setMode('time');
	}

	private createModeTab(mode: ViewMode, label: string): void {
		const tab = this.modeTabsEl.createEl('button', {
			cls: 'tm-mode-tab',
			text: label,
		});
		tab.dataset.mode = mode;
		tab.addEventListener('click', () => {
			this.setMode(mode);
			if (mode === 'time') {
				const viewId = this.timeTree.getCurrentViewId('week');
				this.eventBus.emit('view-switched', { viewId, viewType: 'week' });
			} else {
				const phases = this.viewRegistry.getPhaseViews();
				if (phases.length > 0) {
					this.eventBus.emit('view-switched', {
						viewId: phases[0].id,
						viewType: 'phase',
					});
				}
			}
		});
	}

	setMode(mode: ViewMode): void {
		this.currentMode = mode;
		this.timeControlsEl.style.display = mode === 'time' ? 'flex' : 'none';
		this.phaseControlsEl.style.display = mode === 'phase' ? 'flex' : 'none';

		// Update tab active states
		this.modeTabsEl.querySelectorAll('.tm-mode-tab').forEach(tab => {
			const el = tab as HTMLElement;
			el.classList.toggle('tm-mode-tab-active', el.dataset.mode === mode);
		});
	}

	updateTimeView(viewId: string): void {
		// Track the current time level from the node
		const node = this.timeTree.getNode(viewId);
		if (node) {
			this.currentTimeLevel = node.type;
		}
		this.timeBreadcrumb.render(viewId);
	}

	updatePhaseView(viewId: string): void {
		this.phaseSelector.setCurrentPhase(viewId);
	}

	refreshPhases(): void {
		this.phaseSelector.refresh();
	}

	getMode(): ViewMode {
		return this.currentMode;
	}

	getScanHost(): HTMLElement {
		return this.scanHostEl;
	}
}
