import { handleReportEmail } from '../../server/reportEmail.js';

export default async function handler(request, response) {
  await handleReportEmail(request, response);
}
