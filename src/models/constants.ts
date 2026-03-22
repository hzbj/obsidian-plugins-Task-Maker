import { QuadrantCode, TimeNodeType, PluginSettings } from './types';

export const VIEW_TYPE_MATRIX = 'task-maker-matrix';

export const QUADRANT_CODES: QuadrantCode[] = ['ui', 'in', 'un', 'nn'];

export const CHECKBOX_REGEX = /^(\s*- \[)([ xX])(\]\s+)(.+)$/;

export const TIME_VIEW_ID_PATTERNS: Record<TimeNodeType, RegExp> = {
	year: /^\d{4}$/,
	quarter: /^\d{4}q[1-4]$/,
	month: /^\d{4}m(0[1-9]|1[0-2])$/,
	week: /^\d{4}w(0[1-9]|[1-4]\d|5[0-3])$/,
};

export const DEFAULT_SETTINGS: PluginSettings = {
	triggerTags: ['task', 'todo'],
	tagNamespace: 'T',
	phases: [],
	timeView: {
		startYear: new Date().getFullYear() - 1,
		endYear: new Date().getFullYear() + 1,
		weekStart: 1,
		defaultLevel: 'month',
	},
	noteAssociation: {
		enabled: true,
		timeNotePatterns: {
			year: 'YYYY',
			quarter: 'YYYY-[Q]Q',
			month: 'YYYY-MM',
			week: 'YYYY-[W]ww',
		},
		noteSearchFolders: [],
		contentHeadings: ['目标', 'Plan', '计划', 'Goals'],
	},
	ui: {
		quadrantLabels: {
			ui: '紧急且重要',
			in: '重要不紧急',
			un: '紧急不重要',
			nn: '不紧急不重要',
		},
		quadrantColors: {
			ui: '#e74c3c',
			in: '#3498db',
			un: '#f39c12',
			nn: '#95a5a6',
		},
		showSourceFile: true,
		compactMode: false,
	},
};
