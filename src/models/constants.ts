import { QuadrantCode, TimeNodeType, PluginSettings, CategoryPreset } from './types';

export const VIEW_TYPE_MATRIX = 'task-maker-matrix';

export const QUADRANT_CODES: QuadrantCode[] = ['ui', 'in', 'un', 'nn'];

export const CHECKBOX_REGEX = /^(\s*- \[)([ xX])(\]\s+)(.+)$/;

export const TIME_VIEW_ID_PATTERNS: Record<TimeNodeType, RegExp> = {
	week: /^\d{4}w(0[1-9]|[1-4]\d|5[0-3])$/,
};

export const CATEGORY_TAG_PREFIX = 'cat';

export const DEFAULT_SETTINGS: PluginSettings = {
	triggerTags: ['task', 'todo'],
	tagNamespace: 'T',
	phases: [],
	categories: [
		{ id: 'work', name: '工作', color: '#4a9eff' },
		{ id: 'personal', name: '个人', color: '#51cf66' },
		{ id: 'study', name: '学习', color: '#fcc419' },
	],
	timeView: {
		startYear: new Date().getFullYear() - 1,
		endYear: new Date().getFullYear() + 1,
		weekStart: 1,
	},
	noteAssociation: {
		enabled: true,
		timeNotePatterns: {
			week: 'GGGG[W]WW',
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
