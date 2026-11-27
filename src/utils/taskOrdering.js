function taskCreatedTimestamp(task) {
  const timestamp = Date.parse(task?.created_at || task?.createdAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareTasksNewestFirst(left, right) {
  const creationOrder = taskCreatedTimestamp(right) - taskCreatedTimestamp(left);
  if (creationOrder) return creationOrder;

  const leftId = Number(left?.task_id);
  const rightId = Number(right?.task_id);
  if (leftId < 0 && rightId < 0) return leftId - rightId;
  if (leftId >= 0 && rightId >= 0) return rightId - leftId;
  return 0;
}
