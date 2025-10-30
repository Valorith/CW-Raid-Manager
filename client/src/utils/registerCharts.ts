import { Chart as ChartJS, registerables } from 'chart.js';

let registered = false;

export function ensureChartJsRegistered(): void {
  if (registered) {
    return;
  }

  ChartJS.register(...registerables);
  ChartJS.defaults.color = '#e2e8f0';
  ChartJS.defaults.font.family = 'inherit';
  ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
  ChartJS.defaults.plugins.legend.position = 'bottom';
  ChartJS.defaults.elements.line.tension = 0.35;
  ChartJS.defaults.elements.line.borderWidth = 3;
  ChartJS.defaults.elements.point.radius = 4;
  ChartJS.defaults.elements.point.hoverRadius = 6;
  ChartJS.defaults.plugins.tooltip.mode = 'index';
  ChartJS.defaults.plugins.tooltip.intersect = false;
  ChartJS.defaults.responsive = true;

  registered = true;
}
