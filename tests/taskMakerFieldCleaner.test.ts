import test from 'node:test';
import assert from 'node:assert/strict';
import {
	clearTaskMakerPhaseFrontmatter,
	removePhaseAssignmentTags,
} from '../src/services/TaskMakerFieldCleaner';

test('clearTaskMakerPhaseFrontmatter removes phase scan fields and keeps unrelated frontmatter', () => {
	const frontmatter: Record<string, unknown> = {
		phase: true,
		'phase-id': 'mvp',
		'phase-label': 'MVP',
		'phase-start': '2026-01-01',
		'phase-end': '2026-02-01',
		tags: ['keep'],
		owner: 'me',
	};

	clearTaskMakerPhaseFrontmatter(frontmatter);

	assert.deepEqual(frontmatter, {
		tags: ['keep'],
		owner: 'me',
	});
});

test('removePhaseAssignmentTags removes only the selected phase tags with namespace', () => {
	const content = [
		'- [ ] Build slice #task #T/mvp-ui #T/mvp-p1 #T/next-in',
		'\t- [ ] Child task #T/mvp-nn #T/other-p2',
		'- [ ] Keep compact #T/mvp-ui.',
	].join('\n');

	assert.equal(
		removePhaseAssignmentTags(content, 'mvp', 'T'),
		[
			'- [ ] Build slice #task #T/next-in',
			'\t- [ ] Child task #T/other-p2',
			'- [ ] Keep compact.',
		].join('\n')
	);
});
