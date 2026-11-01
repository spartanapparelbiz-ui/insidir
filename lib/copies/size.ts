/* What a member puts on each copied move (Settings → Copy size). Pure; no imports so the settings validator and the
 * schema can both use it. */
export const COPY_SIZES = [10, 50, 100] as const;
export type CopySize = (typeof COPY_SIZES)[number];
export const DEFAULT_COPY_SIZE: CopySize = 10;
export const copySizeOf = (s: { copySize?: number } | null | undefined): CopySize =>
  (COPY_SIZES as readonly number[]).includes(Number(s?.copySize)) ? (Number(s!.copySize) as CopySize) : DEFAULT_COPY_SIZE;
