import { EventBus } from '../../services/EventBus';
import { ViewRegistryService } from '../../services/ViewRegistryService';
import { PhaseSelector } from './PhaseSelector';

export class ViewNavigator {
	el: HTMLElement;
	private phaseControlsEl: HTMLElement;
	private phaseSelector: PhaseSelector;
	private scanHostEl: HTMLElement;
	private filterBtn: HTMLElement;
	private phaseToggleBtn: HTMLElement;

	private hideCompleted: boolean = false;
	private phaseCollapsed: boolean = false;

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus,
		private onAddPhase?: () => void,
		private onToggleFilter?: () => void
	) {
		this.el = container.createDiv({ cls: 'tm-nav-bar' });

		// Top row: phase toggle + filter toggle + scan host
		const topRow = this.el.createDiv({ cls: 'tm-nav-top-row' });

		this.phaseToggleBtn = topRow.createEl('button', {
			cls: 'tm-phase-toggle-btn',
			attr: { 'aria-label': '\u6298\u53E0/\u5C55\u5F00\u9636\u6BB5\u9009\u62E9\u5668' },
		});
		this.phaseToggleBtn.innerHTML = '<span class="tm-phase-toggle-icon">\u25BC</span> \u9636\u6BB5';
		this.phaseToggleBtn.addEventListener('click', () => {
			this.phaseCollapsed = !this.phaseCollapsed;
			this.phaseControlsEl.style.display = this.phaseCollapsed ? 'none' : 'flex';
			this.phaseToggleBtn.classList.toggle('tm-phase-collapsed', this.phaseCollapsed);
			const icon = this.phaseToggleBtn.querySelector('.tm-phase-toggle-icon');
			if (icon) icon.textContent = this.phaseCollapsed ? '\u25B6' : '\u25BC';
		});

		this.filterBtn = topRow.createEl('button', {
			cls: 'tm-filter-toggle-btn',
			text: '\u9690\u85CF\u5DF2\u5B8C\u6210',
		});
		this.filterBtn.addEventListener('click', () => {
			this.hideCompleted = !this.hideCompleted;
			this.filterBtn.classList.toggle('tm-filter-active', this.hideCompleted);
			this.filterBtn.textContent = this.hideCompleted ? '\u663E\u793A\u5168\u90E8' : '\u9690\u85CF\u5DF2\u5B8C\u6210';
			this.onToggleFilter?.();
		});

		// Scan host container (populated by MatrixView)
		this.scanHostEl = topRow.createDiv({ cls: 'tm-scan-host' });

		// Phase view controls
		this.phaseControlsEl = this.el.createDiv({ cls: 'tm-phase-controls' });
		this.phaseSelector = new PhaseSelector(this.phaseControlsEl, viewRegistry, eventBus);

		if (this.onAddPhase) {
			const addBtn = this.phaseControlsEl.createEl('button', {
				cls: 'tm-add-phase-btn',
				text: '+',
				attr: { 'aria-label': '\u6DFB\u52A0\u9636\u6BB5\u5C5E\u6027\u5230\u5F53\u524D\u7B14\u8BB0' },
			});
			addBtn.addEventListener('click', () => this.onAddPhase!());
		}
	}

	updatePhaseView(viewId: string): void {
		this.phaseSelector.setCurrentPhase(viewId);
	}

	refreshPhases(): void {
		this.phaseSelector.refresh();
	}

	getScanHost(): HTMLElement {
		return this.scanHostEl;
	}

	isHideCompleted(): boolean {
		return this.hideCompleted;
	}
}
