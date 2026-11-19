/** Client-supplied blob paths must stay inside an exact owner/project prefix. */
export function ownsBlobPath(pathname: string, prefix: string) {
  return (
    pathname.startsWith(`${prefix}/`) &&
    pathname.split("/").every((part) => /^[a-z\d][a-z\d._-]*$/i.test(part))
  );
}
