import type { StatusOption } from '@/components/StatusPicker'
import { TASK_STATUSES, TASK_STATUS_LABEL } from './tasks'
import type { ApprovalState, SponsorState, TaskStatus } from './types'

/**
 * Every state a record can be in, in one place.
 *
 * The tone carries meaning, so it has to mean the same thing everywhere:
 * `pressure` is amber and says *somebody has to do something*. It belongs on a
 * purchase waiting for a decision, and it does not belong on a sponsor who has
 * pledged — that is good news the team went and earned, and colouring it like
 * a warning made a full pipeline look like a list of problems.
 *
 * Sponsors read as a progression instead: nothing yet, promised, landed.
 */

export const SPONSOR_STATUS: StatusOption<SponsorState>[] = [
  { value: 'Prospect', label: 'Prospect', tone: 'neutral' },
  { value: 'Pledged', label: 'Pledged', tone: 'dim' },
  { value: 'Received', label: 'Received', tone: 'signal' },
  { value: 'Declined', label: 'Declined', tone: 'neutral' },
]

export const APPROVAL_STATUS: StatusOption<ApprovalState>[] = [
  { value: 'pending', label: 'Pending', tone: 'pressure' },
  { value: 'approved', label: 'Approved', tone: 'signal' },
  { value: 'held', label: 'On hold', tone: 'neutral' },
  { value: 'denied', label: 'Denied', tone: 'neutral' },
]

const TASK_TONE: Record<TaskStatus, StatusOption<TaskStatus>['tone']> = {
  todo: 'neutral',
  doing: 'signal',
  blocked: 'pressure',
  done: 'dim',
}

export const TASK_STATUS: StatusOption<TaskStatus>[] = TASK_STATUSES.map((value) => ({
  value,
  label: TASK_STATUS_LABEL[value],
  tone: TASK_TONE[value],
}))

/** Parts are owned or not; the picker keeps them consistent with everything else. */
export const OWNERSHIP_STATUS: StatusOption<'needed' | 'owned'>[] = [
  { value: 'needed', label: 'Needed', tone: 'pressure' },
  { value: 'owned', label: 'Owned', tone: 'signal' },
]
