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

	private currentMode: ViewMode = 'time';
	private currentTimeLevel: TimeNodeType = 'month';

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private timeTree: TimeTreeService,
		private eventBus: EventBus
	) {
		this.el = container.createDiv({ cls: 'tm-nav-bar' });

		// Mode tabs
		this.modeTabsEl = this.el.createDiv({ cls: 'tm-mode-tabs' });
		this.createModeTab('time', '时间视图');
		this.createModeTab('phase', '阶段视图');

		// Time view controls
		this.timeControlsEl = this.el.createDiv({ cls: 'tm-time-controls' });
		this.timeBreadcrumb = new TimeBreadcrumb(this.timeControlsEl, timeTree, eventBus);

		// "Jump to today" button
		this.todayBtn = this.timeControlsEl.createEl('button', {
			cls: 'tm-today-btn',
			text: '今天',
		});
		this.todayBtn.addEventListener('click', () => {
			const level = this.currentTimeLevel;
			const viewId = this.timeTree.getCurrentViewId(level);
			this.eventBus.emit('view-switched', { viewId, viewType: level });
		});

		// Phase view controls
		this.phaseControlsEl = this.el.createDiv({ cls: 'tm-phase-controls' });
		this.phaseSelector = new PhaseSelector(this.phaseControlsEl, viewRegistry, eventBus);

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
				const viewId = this.timeTree.getCurrentViewId('month');
				this.eventBus.emit('view-switched', { viewId, viewType: 'month' });
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
}
