export function formatNumber(
  value: number | string,
  decimals: number = 3
): string {
  if (!value) return "0.000"

  const num = typeof value === "string" ? Number(value) : value

  if (isNaN(num)) return "0.000"

  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatUSD(value: number, decimals = 2): string {
  if (!isFinite(value) || value < 0) return '$0.00'
  return '$' + formatNumber(value, decimals)
}

export function formatPercent(
  value: number | string,
  decimals: number = 2
): string {
  if (!value) return "0.00%"

  const num = typeof value === "string" ? Number(value) : value

  if (isNaN(num)) return "0.00%"

  return `${num.toFixed(decimals)}%`
}
