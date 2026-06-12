import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataviewPriority, stripDataviewPriorityFields, sortTasksByPriority } from '../src/services/TaskPriorityService';
import { Task } from '../src/models/types';

function task(id: string, priority?: number): Task {
	return {
		id,
		text: id,
		rawLine: `- [ ] ${id}`,
		filePath: `${id}.md`,
		lineNumber: 0,
		completed: false,
		triggerType: 'inline',
		quadrantAssignments: {},
		indentLevel: 0,
		priority,
	};
}

test('parseDataviewPriority maps supported priority fields', () => {
	assert.equal(parseDataviewPriority('- [ ] A [priority:: highest]'), 1);
	assert.equal(parseDataviewPriority('- [ ] A [priority:: high]'), 2);
	assert.equal(parseDataviewPriority('- [ ] A [priority:: medium]'), 3);
	assert.equal(parseDataviewPriority('- [ ] A [priority:: low]'), 4);
});

test('parseDataviewPriority tolerates case and whitespace and ignores unknown values', () => {
	assert.equal(parseDataviewPriority('- [ ] A [ priority :: HIGH ]'), 2);
	assert.equal(parseDataviewPriority('- [ ] A [priority:: urgent]'), undefined);
	assert.equal(parseDataviewPriority('- [ ] A [priority:: urgent] [priority:: low]'), 4);
});

test('stripDataviewPriorityFields removes only priority dataview fields', () => {
	assert.equal(
		stripDataviewPriorityFields('- [ ] Build [priority:: highest] [owner:: me]'),
		'- [ ] Build [owner:: me]'
	);
});

test('sortTasksByPriority orders prioritized tasks before unprioritized tasks', () => {
	const sorted = sortTasksByPriority([
		task('none'),
		task('medium', 3),
		task('highest', 1),
		task('low', 4),
		task('high', 2),
	]);

	assert.deepEqual(sorted.map(t => t.id), ['highest', 'high', 'medium', 'low', 'none']);
});
