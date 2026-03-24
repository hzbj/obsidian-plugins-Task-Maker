import { Task, TaskTreeNode } from '../../models/types';

/**
 * Build a forest (array of root nodes) from a flat task array.
 * Hierarchy is determined by indentLevel within the same file.
 * Tasks from different files never form parent-child relationships.
 */
export function buildTaskForest(tasks: Task[]): TaskTreeNode[] {
	// Group tasks by filePath to keep hierarchy file-local
	const byFile = new Map<string, Task[]>();
	for (const task of tasks) {
		let group = byFile.get(task.filePath);
		if (!group) {
			group = [];
			byFile.set(task.filePath, group);
		}
		group.push(task);
	}

	const roots: TaskTreeNode[] = [];

	for (const fileTasks of byFile.values()) {
		// Sort by line number within file
		fileTasks.sort((a, b) => a.lineNumber - b.lineNumber);

		// Stack-based tree builder
		const stack: { node: TaskTreeNode; level: number }[] = [];

		for (const task of fileTasks) {
			const node: TaskTreeNode = { task, children: [] };

			// Pop stack entries that are at the same or deeper indent level
			while (stack.length > 0 && stack[stack.length - 1].level >= task.indentLevel) {
				stack.pop();
			}

			if (stack.length > 0) {
				// This task is a child of the stack top
				stack[stack.length - 1].node.children.push(node);
			} else {
				// Root-level node
				roots.push(node);
			}

			stack.push({ node, level: task.indentLevel });
		}
	}

	return roots;
}

/**
 * Recursively count all descendants of a node.
 */
export function countDescendants(node: TaskTreeNode): number {
	let count = node.children.length;
	for (const child of node.children) {
		count += countDescendants(child);
	}
	return count;
}
