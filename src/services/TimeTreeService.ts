import { TimeNode, TimeNodeType, PluginSettings } from '../models/types';
import { moment } from 'obsidian';

export class TimeTreeService {
	private root: TimeNode[] = [];
	private nodeMap: Map<string, TimeNode> = new Map();
	private parentMap: Map<string, string> = new Map();

	constructor(private getSettings: () => PluginSettings) {}

	/** Rebuild the entire time tree from settings */
	rebuild(): void {
		this.root = [];
		this.nodeMap.clear();
		this.parentMap.clear();

		const settings = this.getSettings();
		const { startYear, endYear, weekStart } = settings.timeView;

		for (let y = startYear; y <= endYear; y++) {
			const yearNode = this.buildYearNode(y, weekStart);
			this.root.push(yearNode);
			this.registerNode(yearNode, null);
		}
	}

	private buildYearNode(year: number, weekStart: 0 | 1): TimeNode {
		const yearStart = moment(`${year}-01-01`);
		const yearEnd = moment(`${year}-12-31`);

		const quarters: TimeNode[] = [];
		for (let q = 1; q <= 4; q++) {
			const qNode = this.buildQuarterNode(year, q, weekStart);
			quarters.push(qNode);
		}

		return {
			type: 'year',
			viewId: `${year}`,
			label: `${year}`,
			start: yearStart.format('YYYY-MM-DD'),
			end: yearEnd.format('YYYY-MM-DD'),
			children: quarters,
		};
	}

	private buildQuarterNode(year: number, quarter: number, weekStart: 0 | 1): TimeNode {
		const startMonth = (quarter - 1) * 3 + 1;
		const endMonth = startMonth + 2;
		const qStart = moment(`${year}-${String(startMonth).padStart(2, '0')}-01`);
		const qEnd = moment(`${year}-${String(endMonth).padStart(2, '0')}-01`).endOf('month');

		const months: TimeNode[] = [];
		for (let m = startMonth; m <= endMonth; m++) {
			const mNode = this.buildMonthNode(year, m, weekStart);
			months.push(mNode);
		}

		return {
			type: 'quarter',
			viewId: `${year}q${quarter}`,
			label: `Q${quarter}`,
			start: qStart.format('YYYY-MM-DD'),
			end: qEnd.format('YYYY-MM-DD'),
			children: months,
		};
	}

	private buildMonthNode(year: number, month: number, weekStart: 0 | 1): TimeNode {
		const mStart = moment(`${year}-${String(month).padStart(2, '0')}-01`);
		const mEnd = mStart.clone().endOf('month');

		const weeks: TimeNode[] = [];
		const weekUnit = weekStart === 1 ? 'isoWeek' : 'week';

		// Find the first week that overlaps with this month
		const cursor = mStart.clone().startOf(weekUnit);
		const seen = new Set<number>();

		while (cursor.isSameOrBefore(mEnd)) {
			const weekNum = weekStart === 1 ? cursor.isoWeek() : cursor.week();
			const weekYear = weekStart === 1 ? cursor.isoWeekYear() : cursor.weekYear();

			if (!seen.has(weekNum) || weekYear !== year) {
				// Only include weeks where the majority or start falls in this month
				const weekStartDate = cursor.clone().startOf(weekUnit);
				const weekEndDate = cursor.clone().endOf(weekUnit);

				// Include this week if its Thursday (ISO) falls in this month
				const thursday = weekStartDate.clone().add(3, 'days');
				if (thursday.month() + 1 === month && thursday.year() === year) {
					const wViewId = `${weekYear}w${String(weekNum).padStart(2, '0')}`;
					if (!seen.has(weekNum)) {
						weeks.push({
							type: 'week',
							viewId: wViewId,
							label: `W${weekNum}`,
							start: weekStartDate.format('YYYY-MM-DD'),
							end: weekEndDate.format('YYYY-MM-DD'),
							children: [],
						});
						seen.add(weekNum);
					}
				}
			}

			cursor.add(1, 'week');
		}

		return {
			type: 'month',
			viewId: `${year}m${String(month).padStart(2, '0')}`,
			label: mStart.format('MMMM'),
			start: mStart.format('YYYY-MM-DD'),
			end: mEnd.format('YYYY-MM-DD'),
			children: weeks,
		};
	}

	private registerNode(node: TimeNode, parentId: string | null): void {
		this.nodeMap.set(node.viewId, node);
		if (parentId !== null) {
			this.parentMap.set(node.viewId, parentId);
		}
		for (const child of node.children) {
			this.registerNode(child, node.viewId);
		}
	}

	getRoot(): TimeNode[] {
		return this.root;
	}

	getNode(viewId: string): TimeNode | undefined {
		return this.nodeMap.get(viewId);
	}

	getParent(viewId: string): TimeNode | undefined {
		const parentId = this.parentMap.get(viewId);
		return parentId ? this.nodeMap.get(parentId) : undefined;
	}

	getParentId(viewId: string): string | undefined {
		return this.parentMap.get(viewId);
	}

	getChildren(viewId: string): TimeNode[] {
		const node = this.nodeMap.get(viewId);
		return node ? node.children : [];
	}

	getSiblings(viewId: string): TimeNode[] {
		const parentId = this.parentMap.get(viewId);
		if (!parentId) {
			// Root level - return all year nodes
			return this.root;
		}
		const parent = this.nodeMap.get(parentId);
		return parent ? parent.children : [];
	}

	/** Get the breadcrumb path from root to the given viewId */
	getBreadcrumb(viewId: string): TimeNode[] {
		const path: TimeNode[] = [];
		let current = viewId;
		while (current) {
			const node = this.nodeMap.get(current);
			if (node) {
				path.unshift(node);
			}
			const parentId = this.parentMap.get(current);
			if (!parentId) break;
			current = parentId;
		}
		return path;
	}

	/** Get the viewId for "today" at a given level */
	getCurrentViewId(level: TimeNodeType): string {
		const now = moment();
		switch (level) {
			case 'year':
				return `${now.year()}`;
			case 'quarter':
				return `${now.year()}q${Math.ceil((now.month() + 1) / 3)}`;
			case 'month':
				return `${now.year()}m${String(now.month() + 1).padStart(2, '0')}`;
			case 'week': {
				const settings = this.getSettings();
				if (settings.timeView.weekStart === 1) {
					return `${now.isoWeekYear()}w${String(now.isoWeek()).padStart(2, '0')}`;
				}
				return `${now.weekYear()}w${String(now.week()).padStart(2, '0')}`;
			}
		}
	}
}
