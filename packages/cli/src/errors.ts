/** A build that failed for a reason the developer can fix. */
export class BuildError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "BuildError";
    this.problems = problems;
  }
}
