/**
 * The Display tab of a List (board 15): "Each row looks like" and "What goes where" (the `slots`
 * control), then the look, List or Cards.
 */

import { DrawerBlock, DrawerGroup, SegmentedControl } from "@volvel/ui";
import type { Env } from "../controls.tsx";
import { withConfig } from "../model.ts";
import { FullSegments } from "./FullSegments.tsx";
import { SlotsGroup } from "./slots.tsx";
import type { TableSource } from "./tableData.ts";

/** LOOK: Rows, List or Cards. */
export function ListLookSection({ env }: { env: Env }) {
  const look = env.config.look === "cards" ? "cards" : "list";
  return (
    <DrawerGroup label="Look">
      <DrawerBlock label="Rows">
        <FullSegments>
          <SegmentedControl
            label="Rows"
            value={look}
            options={[
              { value: "list", label: "List" },
              { value: "cards", label: "Cards" },
            ]}
            onChange={(next) =>
              env.write(
                withConfig(env.widget, "look", next),
                "changing how rows look",
                `config:${env.widget.id}:look`,
              )
            }
          />
        </FullSegments>
      </DrawerBlock>
    </DrawerGroup>
  );
}

/** The Display tab of a List. */
export function ListDisplay({ env, ...source }: { env: Env } & TableSource) {
  return (
    <>
      <SlotsGroup env={env} {...source} />
      <ListLookSection env={env} />
    </>
  );
}
