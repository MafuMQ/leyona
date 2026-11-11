export default function AbacusMark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="abacus-mark"
      src="/brand/abacus.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
