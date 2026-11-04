import { handleReportEmail } from './reportEmail.js';

function registerReportEmailRoute(server) {
  server.middlewares.use('/api/reports/email', (request, response) => {
    void handleReportEmail(request, response);
  });
}

export default function viteReportEmailPlugin() {
  return {
    name: 'nutrigrid-report-email',
    configureServer: registerReportEmailRoute,
    configurePreviewServer: registerReportEmailRoute,
  };
}
