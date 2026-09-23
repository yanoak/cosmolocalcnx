/**
 * `archieml` ships no types. It is used only by scripts/fetch-copy.ts, at fetch time, so
 * the app bundle never sees it — this declaration exists so `tsc --noEmit` does not
 * either complain or, worse, be told to skip the scripts directory.
 */
declare module 'archieml' {
  const archieml: {
    load(input: string): Record<string, unknown>;
  };
  export default archieml;
}
