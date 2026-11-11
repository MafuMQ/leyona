// Credits use 10,000 integer units. Launch shares are whole shares.
export const SCALE = 10_000n;
export function units(input: string): bigint {
  if (!/^\d{1,9}(\.\d{1,4})?$/.test(input))
    throw new Error("Enter a positive amount with at most four decimals.");
  const [whole, fraction = ""] = input.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"));
}
export function amount(value: bigint | string): string {
  const n = BigInt(value),
    sign = n < 0n ? "-" : "",
    v = n < 0n ? -n : n;
  return `${sign}${v / SCALE}.${(v % SCALE).toString().padStart(4, "0")}`;
}
export function comboPayout(stake: bigint, prices: number[]): bigint {
  if (
    stake <= 0n ||
    prices.length < 2 ||
    prices.length > 6 ||
    prices.some((p) => !Number.isInteger(p) || p <= 0 || p >= 10000)
  )
    throw new Error("Invalid combo.");
  const denominator = prices.reduce((v, p) => v * BigInt(p), 1n);
  return (stake * SCALE ** BigInt(prices.length)) / denominator;
}
export function proportionalCost(
  cost: bigint,
  quantity: bigint,
  sold: bigint,
): bigint {
  if (sold < 0n || sold > quantity || quantity <= 0n)
    throw new Error("Invalid inventory movement.");
  return sold === quantity ? cost : (cost * sold) / quantity;
}
