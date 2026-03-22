import chalk from "chalk";

export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function getRiskColor(risk: string): (s: string) => string {
  switch (risk) {
    case "safe":
    case "low":
      return chalk.green;
    case "medium":
      return chalk.yellow;
    case "high":
    case "critical":
      return chalk.red;
    default:
      return chalk.dim;
  }
}
