import { ViewDefinition } from '../../models/types';
import { EventBus } from '../../services/EventBus';
import { ViewRegistryService } from '../../services/ViewRegistryService';
import { Menu } from 'obsidian';

export class PhaseSelector {
	el: HTMLElement;
	private currentViewId = '';

	constructor(
		private container: HTMLElement,
		private viewRegistry: ViewRegistryService,
		private eventBus: EventBus,
		private onArchivePhase?: (phaseId: string) => void,
		private onDeletePhase?: (phaseId: string) => void
	) {
		this.el = container.createDiv({ cls: 'tm-phase-selector' });
		this.refresh();
	}

	refresh(): void {
		this.el.empty();
		const phases = this.viewRegistry.getPhaseViews();

		if (phases.length === 0) {
			this.el.createSpan({
				cls: 'tm-phase-empty',
				text: '(无阶段 - 请在设置中添加)',
			});
			return;
		}

		for (const phase of phases) {
			const btn = this.el.createEl('button', {
				cls: 'tm-phase-btn',
				text: phase.label,
			});
			btn.dataset.viewId = phase.id;
			if (phase.id === this.currentViewId) {
				btn.classList.add('tm-phase-btn-active');
			}
			btn.addEventListener('click', () => {
				this.eventBus.emit('view-switched', { viewId: phase.id, viewType: 'phase' });
			});

			btn.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();
				if (this.onArchivePhase) {
					menu.addItem(item => item
						.setTitle('归档阶段')
						.setIcon('archive')
						.onClick(() => this.onArchivePhase!(phase.id))
					);
				}
				if (this.onDeletePhase) {
					menu.addItem(item => item
						.setTitle('删除阶段')
						.setIcon('trash')
						.onClick(() => this.onDeletePhase!(phase.id))
					);
				}
				menu.showAtMouseEvent(e);
			});
		}
	}

	setCurrentPhase(viewId: string): void {
		this.currentViewId = viewId;
		this.el.querySelectorAll('.tm-phase-btn').forEach(btn => {
			const el = btn as HTMLElement;
			el.classList.toggle('tm-phase-btn-active', el.dataset.viewId === viewId);
		});
	}
}
