import { TimeNode, TimeNodeType, PluginSettings } from '../models/types';
import { moment } from 'obsidian';

export class TimeTreeService {
	private root: TimeNode[] = [];
	private nodeMap: Map<string, TimeNode> = new Map();

	constructor(private getSettings: () => PluginSettings) {}

	/** Rebuild the time tree — now a flat list of week nodes */
	rebuild(): void {
		this.root = [];
		this.nodeMap.clear();

		const settings = this.getSettings();
		const { startYear, endYear, weekStart } = settings.timeView;
		const weekUnit = weekStart === 1 ? 'isoWeek' : 'week';

		const globalStart = moment(`${startYear}-01-01`).startOf(weekUnit);
		const globalEnd = moment(`${endYear}-12-31`).endOf(weekUnit);

		const cursor = globalStart.clone();
		const seen = new Set<string>();

		while (cursor.isSameOrBefore(globalEnd)) {
			const weekNum = weekStart === 1 ? cursor.isoWeek() : cursor.week();
			const weekYear = weekStart === 1 ? cursor.isoWeekYear() : cursor.weekYear();
			const wViewId = `${weekYear}w${String(weekNum).padStart(2, '0')}`;

			if (!seen.has(wViewId)) {
				const weekStartDate = cursor.clone().startOf(weekUnit);
				const weekEndDate = cursor.clone().endOf(weekUnit);

				const node: TimeNode = {
					type: 'week',
					viewId: wViewId,
					label: `${weekYear} W${weekNum}`,
					start: weekStartDate.format('YYYY-MM-DD'),
					end: weekEndDate.format('YYYY-MM-DD'),
					children: [],
				};

				this.root.push(node);
				this.nodeMap.set(wViewId, node);
				seen.add(wViewId);
			}

			cursor.add(1, 'week');
		}
	}

	getRoot(): TimeNode[] {
		return this.root;
	}

	getNode(viewId: string): TimeNode | undefined {
		return this.nodeMap.get(viewId);
	}

	getParent(viewId: string): TimeNode | undefined {
		// Flat structure — weeks have no parent
		return undefined;
	}

	getParentId(viewId: string): string | undefined {
		return undefined;
	}

	getChildren(viewId: string): TimeNode[] {
		const node = this.nodeMap.get(viewId);
		return node ? node.children : [];
	}

	getSiblings(viewId: string): TimeNode[] {
		// All weeks are siblings at the root level
		return this.root;
	}

	/** Get the breadcrumb path — for a flat structure, just the node itself */
	getBreadcrumb(viewId: string): TimeNode[] {
		const node = this.nodeMap.get(viewId);
		return node ? [node] : [];
	}

	/** Get the viewId for "today" at week level */
	getCurrentViewId(level?: TimeNodeType): string {
		const now = moment();
		const settings = this.getSettings();
		if (settings.timeView.weekStart === 1) {
			return `${now.isoWeekYear()}w${String(now.isoWeek()).padStart(2, '0')}`;
		}
		return `${now.weekYear()}w${String(now.week()).padStart(2, '0')}`;
	}
}
