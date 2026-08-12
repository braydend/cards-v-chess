/**
 * Writes `text` to the clipboard and reports whether it succeeded.
 *
 * Pure so the decision is testable without a browser: the caller passes the
 * writer (`navigator.clipboard.writeText` in `About.tsx`), and an absent or
 * denied clipboard — which surfaces as either a synchronous throw or a
 * rejection — resolves to `false`. The seed stays visible on screen either
 * way, so a failure is not an error the UI needs to surface.
 */
export async function copyText(
  text: string,
  write: (text: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    await write(text)
    return true
  } catch {
    return false
  }
}
