/** The shape of a Help page guide. Each guide says what the role can see, what it cannot, and how to do common jobs. */

export interface GuideTask {
  task: string;
  steps: string[];
}

export interface RoleGuide {
  id: string;
  title: string;
  /** What this role can see and do. Matches firestore.rules and the server checks. */
  sees: string[];
  /** What this role cannot see or change. */
  cannot: string[];
  tasks: GuideTask[];
}
