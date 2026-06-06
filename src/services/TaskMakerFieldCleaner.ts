const PHASE_FRONTMATTER_FIELDS = [
	'phase',
	'phase-id',
	'phase-label',
	'phase-start',
	'phase-end',
];

export function clearTaskMakerPhaseFrontmatter(frontmatter: Record<string, unknown>): void {
	for (const field of PHASE_FRONTMATTER_FIELDS) {
		delete frontmatter[field];
	}
}

export function removePhaseAssignmentTags(content: string, phaseId: string, namespace: string): string {
	const tagRegex = buildPhaseAssignmentTagRegex(phaseId, namespace);
	return content
		.split('\n')
		.map(line => removePhaseTagsFromLine(line, tagRegex))
		.join('\n');
}

function buildPhaseAssignmentTagRegex(phaseId: string, namespace: string): RegExp {
	const trimmedNamespace = namespace.trim();
	const prefix = trimmedNamespace ? `${escapeRegex(trimmedNamespace)}/` : '';
	return new RegExp(`\\s*#${prefix}${escapeRegex(phaseId)}-(ui|in|un|nn|p1|p2)\\b`, 'g');
}

function removePhaseTagsFromLine(line: string, tagRegex: RegExp): string {
	const match = /^(\s*)(.*)$/.exec(line);
	if (!match) return line;

	const [, leading, body] = match;
	tagRegex.lastIndex = 0;
	const cleanedBody = body
		.replace(tagRegex, '')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/[ \t]+$/g, '');
	return `${leading}${cleanedBody}`;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
