import type { Task, TaskStatus } from './types'

/**
 * Task lifecycle. A task is not a checkbox: "blocked" and "in progress" are the
 * states a team actually argues about at a build meeting, and collapsing them
 * into done/not-done loses the only information worth reporting upward.
 */
export const TASK_STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'var(--ink-4)',
  doing: 'var(--signal)',
  blocked: 'var(--pressure)',
  done: 'var(--signal-dim)',
}

export function isDone(task: Task): boolean {
  return task.status === 'done'
}

export function isOpen(task: Task): boolean {
  return task.status !== 'done'
}

/** Advancing a checkbox toggles the two ends of the lifecycle, nothing subtler. */
export function toggledStatus(status: TaskStatus): TaskStatus {
  return status === 'done' ? 'todo' : 'done'
}
