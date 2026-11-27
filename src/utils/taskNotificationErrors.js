export async function getTaskNotificationErrorMessage(error) {
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await response.json();
      const message = body?.error || body?.reason || body?.message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    } catch (parseError) {
      console.warn('Could not read the task notification error response:', parseError);
    }

    if (Number.isInteger(response.status)) {
      return `The task notification service returned HTTP ${response.status}.`;
    }
  }
  return error?.message || 'The task notification service returned an unknown error.';
}
