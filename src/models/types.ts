import { TFile } from 'obsidian';

// ============ Quadrant Types ============

export type QuadrantCode = 'ui' | 'in' | 'un' | 'nn';

export type TimeNodeType = 'year' | 'quarter' | 'month' | 'week';

export type ViewType = 'phase' | TimeNodeType;

// ============ Task ============

export interface Task {
	/** Stable ID: `filePath:lineNumber` */
	id: string;
	/** Clean text without checkbox prefix and quadrant tags */
	text: string;
	/** Original line text as-is */
	rawLine: string;
	/** Source file path */
	filePath: string;
	/** Line number (0-based) */
	lineNumber: number;
	/** Whether the checkbox is checked */
	completed: boolean;
	/** How this task was triggered for extraction */
	triggerType: 'frontmatter' | 'inline';
	/** viewId -> QuadrantCode mapping, parsed from inline tags */
	quadrantAssignments: Record<string, QuadrantCode>;
}

// ============ Views ============

export interface ViewDefinition {
	id: string;
	type: ViewType;
	label: string;
	parentId: string | null;
	timePeriod?: { start: string; end: string };
	notePattern?: string;
}

export interface PhaseDefinition {
	id: string;
	label: string;
	order: number;
	timePeriod?: { start: string; end: string };
	noteFilePath?: string;
}

export interface TimeNode {
	type: TimeNodeType;
	viewId: string;
	label: string;
	/** ISO date string */
	start: string;
	/** ISO date string */
	end: string;
	children: TimeNode[];
}

// ============ Settings ============

export interface PluginSettings {
	triggerTags: string[];
	tagNamespace: string;
	phases: PhaseDefinition[];
	timeView: {
		startYear: number;
		endYear: number;
		weekStart: 0 | 1;
		defaultLevel: TimeNodeType;
	};
	noteAssociation: {
		enabled: boolean;
		timeNotePatterns: Record<TimeNodeType, string>;
		noteSearchFolders: string[];
		contentHeadings: string[];
	};
	ui: {
		quadrantLabels: Record<QuadrantCode, string>;
		quadrantColors: Record<QuadrantCode, string>;
		showSourceFile: boolean;
		compactMode: boolean;
	};
}

// ============ Events ============

export interface EventMap {
	'scan-complete': { tasks: Task[] };
	'tasks-changed': { filePath: string; tasks: Task[] };
	'task-updated': { taskId: string; viewId: string; quadrant: QuadrantCode | null };
	'task-toggled': { taskId: string; completed: boolean };
	'view-switched': { viewId: string; viewType: ViewType };
	'settings-changed': { settings: PluginSettings };
}

// ============ Associated Note ============

export interface AssociatedNote {
	file: TFile;
	viewId: string;
	extractedContent: string;
}
