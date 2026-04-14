import { PhaseDefinition, PriorityLevel } from '../../models/types';
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
		private getPhases: () => PhaseDefinition[],
		private savePhases: () => Promise<void>,
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

		const phaseDefinitions = this.getPhases();

		for (const phase of phases) {
			const phaseDef = phaseDefinitions.find(p => p.id === phase.id);
			const btn = this.el.createEl('button', {
				cls: 'tm-phase-btn',
				text: phase.label,
			});
			btn.dataset.viewId = phase.id;
			if (phase.id === this.currentViewId) {
				btn.classList.add('tm-phase-btn-active');
			}
			// Add priority visual indicators
			// 确保 priority 是数字类型进行比较
			const priorityNum = typeof phaseDef?.priority === 'number' ? phaseDef.priority : parseInt(phaseDef?.priority as unknown as string, 10);
			if (priorityNum === 1) {
				btn.classList.add('tm-phase-btn-priority-1');
			}
			if (priorityNum === 2) {
				btn.classList.add('tm-phase-btn-priority-2');
			}
			btn.addEventListener('click', () => {
				this.eventBus.emit('view-switched', { viewId: phase.id, viewType: 'phase' });
			});

			btn.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				const menu = new Menu();

				// Priority submenu
				// 确保 priority 是数字类型进行比较
				const currentPriorityRaw = phaseDef?.priority;
				const currentPriority = typeof currentPriorityRaw === 'number' ? currentPriorityRaw : parseInt(currentPriorityRaw as unknown as string, 10);
				menu.addItem(item => item
					.setTitle(`设为第一阶段${currentPriority === 1 ? ' ✓' : ''}`)
					.setIcon('star')
					.onClick(async () => {
						await this.setPhasePriority(phase.id, currentPriority === 1 ? undefined : 1);
					}));

				menu.addItem(item => item
					.setTitle(`设为第二阶段${currentPriority === 2 ? ' ✓' : ''}`)
					.setIcon('bookmark')
					.onClick(async () => {
						await this.setPhasePriority(phase.id, currentPriority === 2 ? undefined : 2);
					}));

				menu.addSeparator();

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

	private async setPhasePriority(phaseId: string, priority: PriorityLevel | undefined): Promise<void> {
		const phases = this.getPhases();

		// Clear existing priority of the same level from other phases
		if (priority !== undefined) {
			for (const p of phases) {
				// 确保 priority 是数字类型进行比较
				const pPriority = typeof p.priority === 'number' ? p.priority : parseInt(p.priority as unknown as string, 10);
				if (p.id !== phaseId && pPriority === priority) {
					p.priority = undefined;
				}
			}
		}

		// Set or clear priority for the current phase
		const currentPhase = phases.find(p => p.id === phaseId);
		if (currentPhase) {
			currentPhase.priority = priority;
		}

		await this.savePhases();
		// 注意：savePhases 会触发 settings-changed -> rebuildUI，创建新的 PhaseSelector
		// 这里的 refresh 在旧的 PhaseSelector 上执行，不会影响新 UI
		// 但为了确保当前 UI 立即更新，仍然调用 refresh
		this.refresh();
	}
}
