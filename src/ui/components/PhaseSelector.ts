import { ViewDefinition } from '../../models/types';
import { EventBus } from '../../services/EventBus';
import { ViewRegistryService } from '../../services/ViewRegistryService';

export class PhaseSelector {
	el: HTMLElement;
	private selectEl: HTMLSelectElement;

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus
	) {
		this.el = container.createDiv({ cls: 'tm-phase-selector' });

		const label = this.el.createSpan({ cls: 'tm-phase-label', text: '阶段: ' });

		this.selectEl = this.el.createEl('select', { cls: 'tm-phase-select' });
		this.selectEl.addEventListener('change', () => {
			const viewId = this.selectEl.value;
			if (viewId) {
				this.eventBus.emit('view-switched', { viewId, viewType: 'phase' });
			}
		});

		this.refresh();
	}

	refresh(): void {
		const phases = this.viewRegistry.getPhaseViews();
		this.selectEl.empty();

		if (phases.length === 0) {
			const opt = this.selectEl.createEl('option', { text: '(无阶段 - 请在设置中添加)', value: '' });
			this.selectEl.disabled = true;
		} else {
			this.selectEl.disabled = false;
			for (const phase of phases) {
				this.selectEl.createEl('option', {
					text: phase.label,
					value: phase.id,
				});
			}
		}
	}

	setCurrentPhase(viewId: string): void {
		this.selectEl.value = viewId;
	}
}
