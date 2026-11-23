import { EmptyCanvas } from "../kit/layout.tsx";
import { Link } from "../router.tsx";

/** An address the console has no screen for, with the way back to one it has. */
export function NotFound({ home, homeLabel }: { home: string; homeLabel: string }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <EmptyCanvas
        title="Nothing here"
        text={
          <>
            There is no page at <code className="font-mono">{location.pathname}</code>. The link may
            be old or mistyped.
          </>
        }
        action={
          <Link to={home} className="font-medium text-action">
            {homeLabel}
          </Link>
        }
      />
    </div>
  );
}

/** What a person who is not an operator finds at an address of the Instance area. */
export function ForOperators({ home, homeLabel }: { home: string; homeLabel: string }) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <EmptyCanvas
        title="For operators"
        text="This screen is part of running the instance, which only its operators can do. An operator of this instance can give you access."
        action={
          <Link to={home} className="font-medium text-action">
            {homeLabel}
          </Link>
        }
      />
    </div>
  );
}
