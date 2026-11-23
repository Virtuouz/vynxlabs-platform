import { Link } from "../router.tsx";
import { Mono } from "./status.tsx";

/** What a refused deploy or promotion names: a path and a sentence. */
export interface RefusalEntry {
  path: string;
  message: string;
}

/**
 * Where what a refusal names is set up. The refusal's paths say what each one
 * is: `/connections/x`, `/secrets/x`, `/variables/x`, `/sources/x`.
 */
export function setUpAddress(link: string, entry: RefusalEntry): string | undefined {
  const [, kind, ...rest] = entry.path.split("/");
  const path = rest.join("/");
  if (!kind || !path) return undefined;
  switch (kind) {
    case "connections":
      return `${link}/connections?setup=${encodeURIComponent(path)}`;
    case "variables":
      return `${link}/variables`;
    case "secrets":
      return `${link}/secrets`;
    case "sources":
      return `${link}/sources`;
    default:
      return undefined;
  }
}

/**
 * The list of what a refusal names, one place for every screen that shows one.
 * With `link`, the console address of the workspace the missing things are set
 * up in, each entry that can be set up there says where.
 */
export function RefusalList({ errors, link }: { errors: RefusalEntry[]; link?: string }) {
  if (errors.length === 0) return null;
  return (
    <ul className="mt-2 mb-0 pl-5">
      {errors.map((one) => {
        const address = link ? setUpAddress(link, one) : undefined;
        return (
          <li key={`${one.path} ${one.message}`}>
            <Mono>{one.path}</Mono> {one.message}
            {address ? (
              <>
                {" "}
                <Link to={address} className="text-action">
                  Set up
                </Link>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
