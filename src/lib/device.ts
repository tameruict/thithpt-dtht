/* Mask key de chong chup/share: giu 4 dau + 4 cuoi, an giua.
 * Key bind vao tai khoan (assigned_to), khong bind thiet bi. */

export function maskKey(code: string): string {
  const v = (code ?? '').trim();
  if (v.length <= 8) return '****';
  return v.slice(0, 4) + '****' + v.slice(-4);
}
