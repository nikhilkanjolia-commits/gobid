// Money in Indian notation (₹14,68,838.20). Paise only when there are any.
export function inr(n: number | null | undefined) {
  if (n == null) return "—";
  const paise = Number.isInteger(n) ? 0 : 2;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: paise, maximumFractionDigits: 2 });
}
