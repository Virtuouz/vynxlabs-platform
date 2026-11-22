// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parse } from "@volvel/markup";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Details,
  Doc,
  GlossaryProvider,
  Grid,
  reveal,
  Term,
  TermScope,
  TermText,
  Toggletip,
  Tree,
  type TreeNode,
} from "./index.ts";

afterEach(cleanup);

describe("a term", () => {
  test("opens from the keyboard, and Escape closes it and gives the word focus back", async () => {
    render(
      <p>
        Each{" "}
        <Term id="workspace" word="workspace" short="Where a tenant's resources live.">
          workspace
        </Term>{" "}
        belongs to one tenant.
      </p>,
    );
    const word = screen.getByRole("button", { name: "workspace" });
    expect(screen.queryByText("Where a tenant's resources live.")).toBeNull();
    word.focus();
    // A button answers Enter and Space with a click.
    fireEvent.click(word);
    await waitFor(() => expect(screen.getByText("Where a tenant's resources live.")).toBeTruthy());
    expect(screen.getByRole("dialog", { name: "workspace" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Where a tenant's resources live.")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(word));
  });

  test("with nothing behind it is the word alone", () => {
    render(
      <p>
        <Term word="status">status</Term>
      </p>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("status")).toBeTruthy();
  });

  test("is underlined where it is first used on a screen, and plain after", () => {
    render(
      <TermScope>
        <p>
          <Term id="rma" word="RMA" short="A return authorisation.">
            RMA
          </Term>{" "}
          then{" "}
          <Term id="rma" word="RMA" short="A return authorisation.">
            RMA
          </Term>{" "}
          and{" "}
          <Term id="sku" word="SKU" short="A stock unit.">
            SKU
          </Term>
        </p>
      </TermScope>,
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "RMA",
      "SKU",
    ]);
  });

  test("outside a scope every use is underlined", () => {
    render(
      <p>
        <Term id="rma" word="RMA" short="x">
          RMA
        </Term>
        <Term id="rma" word="RMA" short="x">
          RMA
        </Term>
      </p>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});

test("a toggletip says what its button is for and opens what it holds", async () => {
  render(
    <Toggletip label="About the timezone" title="Timezone">
      Schedules run in this zone.
    </Toggletip>,
  );
  fireEvent.click(screen.getByRole("button", { name: "About the timezone" }));
  await waitFor(() => expect(screen.getByText("Schedules run in this zone.")).toBeTruthy());
});

test("a folded section opens", () => {
  render(<Details summary="Why a deploy?">Because production changes by deploy.</Details>);
  const details = screen.getByText("Why a deploy?").closest("details");
  expect(details?.open).toBe(false);
  render(
    <Details summary="Open already" defaultOpen>
      Shown.
    </Details>,
  );
  expect(screen.getByText("Open already").closest("details")?.open).toBe(true);
});

describe("a tree", () => {
  const nodes: TreeNode[] = [
    {
      id: "support",
      label: "Support",
      children: [
        { id: "support/refunds", label: "Refunds" },
        {
          id: "support/escalations",
          label: "Escalations",
          children: [{ id: "support/escalations/tier-two", label: "Tier two" }],
        },
      ],
    },
    { id: "faq", label: "Questions" },
  ];
  function Example({ onSelect }: { onSelect: (id: string) => void }) {
    const [selected, setSelected] = useState("faq");
    return (
      <Tree
        label="Pages"
        nodes={nodes}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          onSelect(id);
        }}
      />
    );
  }
  const labels = () => screen.getAllByRole("treeitem").map((item) => item.textContent);
  const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

  test("shows every level, with its depth and whether it is open", () => {
    render(<Example onSelect={() => {}} />);
    expect(screen.getByRole("tree", { name: "Pages" })).toBeTruthy();
    expect(labels()).toEqual(["Support", "Refunds", "Escalations", "Tier two", "Questions"]);
    const tier = screen.getByRole("treeitem", { name: "Tier two" });
    expect(tier.getAttribute("aria-level")).toBe("3");
    expect(screen.getByRole("treeitem", { name: "Support" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("treeitem", { name: "Refunds" }).hasAttribute("aria-expanded")).toBe(
      false,
    );
  });

  test("only the chosen row is a stop for Tab", () => {
    render(<Example onSelect={() => {}} />);
    const stops = screen.getAllByRole("treeitem").filter((item) => item.tabIndex === 0);
    expect(stops.map((item) => item.textContent)).toEqual(["Questions"]);
  });

  test("is walked, opened, closed and chosen from the keyboard", () => {
    const onSelect = vi.fn();
    render(<Example onSelect={onSelect} />);
    screen.getByRole("treeitem", { name: "Questions" }).focus();
    press("Home");
    expect(document.activeElement?.textContent).toBe("Support");
    press("ArrowLeft");
    expect(labels()).toEqual(["Support", "Questions"]);
    press("ArrowRight");
    expect(labels()).toHaveLength(5);
    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Refunds");
    press("ArrowDown");
    press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Tier two");
    press("ArrowLeft");
    expect(document.activeElement?.textContent).toBe("Escalations");
    press("End");
    expect(document.activeElement?.textContent).toBe("Questions");
    press("ArrowUp");
    press("Enter");
    expect(onSelect).toHaveBeenLastCalledWith("support/escalations/tier-two");
    expect(screen.getByRole("treeitem", { name: "Tier two" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  test("a row's arrow opens and closes it without choosing it", () => {
    const onSelect = vi.fn();
    render(<Example onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Close Support" }));
    expect(labels()).toEqual(["Support", "Questions"]);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("treeitem", { name: "Support" }));
    expect(onSelect).toHaveBeenCalledWith("support");
  });
});

describe("a page of documentation", () => {
  const tree = parse(
    [
      "# Deploying",
      "",
      "Each :term[workspace]{id=workspace} is its own. Press :kbd[Ctrl+K].",
      "",
      ":::alert[Mind]{type=warning}",
      "Deleting a table drops its data.",
      ":::",
      "",
      ":::tabs",
      "::::tab{label=CLI}",
      "`volvel deploy`",
      "::::",
      "::::tab{label=Console}",
      "Open **Deploy**.",
      "::::",
      ":::",
      "",
      ':::details{summary="Why?"}',
      "Because.",
      ":::",
      "",
      "[the guide](guides/deploy) and [a secret](guides/secret)",
    ].join("\n"),
  );
  const options = {
    term: (props: Record<string, string>) =>
      props.id === "workspace"
        ? { short: "Where resources live.", href: "/docs/workspaces" }
        : null,
    link: (href: string) => (href === "guides/secret" ? null : `/docs/${href}`),
  };

  test("is drawn with the kit's own alert, tabs, folded section, keys and terms", async () => {
    render(<Doc tree={tree} {...options} />);
    expect(screen.getByRole("heading", { level: 1, name: "Deploying" })).toBeTruthy();
    // A callout, not a live region: it is part of the page, and says nothing as it changes.
    expect(screen.getByRole("note").textContent).toContain("Deleting a table drops its data.");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["CLI", "Console"]);
    expect(screen.getByText("Why?").closest("details")).toBeTruthy();
    expect(screen.getByText("Ctrl+K").tagName).toBe("KBD");
    expect(screen.getByRole("link", { name: "the guide" }).getAttribute("href")).toBe(
      "/docs/guides/deploy",
    );
    // A page the reader may not open is words, with no address in the page at all.
    expect(screen.queryByRole("link", { name: "a secret" })).toBeNull();
    expect(document.body.innerHTML).not.toContain("guides/secret");
    fireEvent.click(screen.getByRole("button", { name: "workspace" }));
    await waitFor(() => expect(screen.getByText("Where resources live.")).toBeTruthy());
    expect(screen.getByRole("link", { name: "More about workspace" }).getAttribute("href")).toBe(
      "/docs/workspaces",
    );
  });

  test("a console draws the way to read more its own way", async () => {
    const open = vi.fn();
    render(
      <Doc
        tree={tree}
        {...options}
        more={(href, word) => (
          <button type="button" onClick={() => open(href)}>
            Open help on {word}
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "workspace" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open help on workspace" }));
    expect(open).toHaveBeenCalledWith("/docs/workspaces");
  });

  test("can be drawn exactly as it is served, for a preview", () => {
    const { container } = render(<Doc tree={tree} {...options} asServed />);
    expect(container.querySelector(".vd-alert.vd-alert-warning")).toBeTruthy();
    expect(container.querySelector("[data-vd-tabs]")).toBeTruthy();
    expect(container.querySelector(".vd-term-tip")?.textContent).toContain("Where resources live.");
    // Tabs are tabs, as the site's script makes them, in the site's own markup.
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(1);
    expect(container.querySelector(".vd-tabs.vd-tabs-on > .vd-tablist")).toBeTruthy();
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs[1] as HTMLElement);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    const sections = container.querySelectorAll(".vd-tab");
    expect((sections[0] as HTMLElement).hidden).toBe(true);
    expect((sections[1] as HTMLElement).hidden).toBe(false);
    // A term opens as a button does.
    const word = container.querySelector(".vd-term-word") as HTMLElement;
    fireEvent.click(word);
    expect(word.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".vd-term-open")).toBeTruthy();
  });

  test("shows what the cursor is in when asked: a tab chooses itself, a fold opens", () => {
    const { container } = render(<Doc tree={tree} {...options} asServed />);
    const second = container.querySelectorAll(".vd-tab")[1] as HTMLElement;
    act(() => reveal(second.querySelector(".vd-tab-body") as HTMLElement));
    expect(second.hidden).toBe(false);
  });
});

describe("a glossary around a screen", () => {
  const terms = [
    { id: "workspace", term: "workspace", aliases: ["workspaces"], short: "Where resources live." },
    { id: "dev-workspace", term: "dev workspace", short: "A workspace that can be changed." },
    { id: "rma", term: "RMA", aliases: ["return authorisation"], short: "A return authorisation." },
    { id: "order", term: "order", short: "What a customer bought." },
  ];
  const underlined = () => screen.getAllByRole("button").map((button) => button.textContent);

  test("underlines a term as whole words, whatever its capitals, and the longest that fits", () => {
    render(
      <GlossaryProvider terms={terms}>
        <p>
          <TermText>Each Dev Workspace has an rma queue</TermText>
        </p>
        <p>
          <TermText>Reorder the border, in order</TermText>
        </p>
      </GlossaryProvider>,
    );
    // "Reorder" and "border" hold the letters of "order" and are not it.
    expect(underlined()).toEqual(["Dev Workspace", "rma", "order"]);
  });

  test("a term is underlined once on a screen, by whichever of its spellings comes first", () => {
    render(
      <GlossaryProvider terms={terms}>
        <h1>
          <TermText>Workspaces</TermText>
        </h1>
        <p>
          <TermText>This workspace and that workspace. A return authorisation is an RMA.</TermText>
        </p>
      </GlossaryProvider>,
    );
    expect(underlined()).toEqual(["Workspaces", "return authorisation"]);
  });

  test("says what the term means, and offers the way to read more when there is one", async () => {
    render(
      <GlossaryProvider
        terms={terms}
        more={(term) => <a href={`/docs/${term.id}`}>Open the page</a>}
      >
        <TermText>Status of the RMA</TermText>
      </GlossaryProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "RMA" }));
    await screen.findByText("A return authorisation.");
    expect(screen.getByRole("link", { name: "Open the page" }).getAttribute("href")).toBe(
      "/docs/rma",
    );
  });

  test("with no glossary, or an empty one, text is text", () => {
    render(
      <>
        <TermText>A workspace.</TermText>
        <GlossaryProvider terms={[]}>
          <TermText>Another workspace.</TermText>
        </GlossaryProvider>
      </>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("a term written with marks a pattern would read is matched as it is written", () => {
    render(
      <GlossaryProvider terms={[{ id: "cpp", term: "C++ (legacy)", short: "The old build." }]}>
        <TermText>Built with C++ (legacy) tools</TermText>
      </GlossaryProvider>,
    );
    expect(underlined()).toEqual(["C++ (legacy)"]);
  });
});

describe("a grid's headings", () => {
  const rows = [{ id: "1", status: "open", total: 4 }];

  test("say what a column holds behind an ⓘ, and pressing it does not sort", async () => {
    const onSort = vi.fn();
    render(
      <Grid
        label="Rows of orders"
        rows={rows}
        rowKey={(row) => row.id}
        empty="No rows."
        onSort={onSort}
        columns={[
          {
            name: "status",
            type: "text",
            sortable: true,
            description: "Where the order is in its life.",
          },
          { name: "total", type: "number", sortable: true },
        ]}
      />,
    );
    expect(screen.getAllByRole("button", { name: /^About / })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "About status" }));
    await screen.findByText("Where the order is in its life.");
    expect(onSort).not.toHaveBeenCalled();
  });

  test("a heading that sorts keeps its one button, and says what a term in it means beside it", async () => {
    const onSort = vi.fn();
    render(
      <GlossaryProvider
        terms={[{ id: "status", term: "status", short: "Where it is in its life." }]}
      >
        <Grid
          label="Rows of orders"
          rows={rows}
          rowKey={(row) => row.id}
          empty="No rows."
          onSort={onSort}
          columns={[
            { name: "status", type: "text", sortable: true },
            { name: "total", type: "number" },
          ]}
        />
      </GlossaryProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About status" }));
    await screen.findByText("Where it is in its life.");
    expect(onSort).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "status" }));
    expect(onSort).toHaveBeenCalledWith("status");
    // A value in a row is never looked at, whatever it says.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("a heading that does not sort underlines the term in it", async () => {
    render(
      <GlossaryProvider
        terms={[{ id: "status", term: "status", short: "Where it is in its life." }]}
      >
        <Grid
          label="Rows of orders"
          rows={[{ id: "1", status: "status unknown" }]}
          rowKey={(row) => row.id}
          empty="No rows."
          columns={[{ name: "status", type: "text" }]}
        />
      </GlossaryProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "status" }));
    await screen.findByText("Where it is in its life.");
    // The row holds the word too, and it is left alone there.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
