/** A build that failed for a reason the developer can fix. */
export class BuildError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "BuildError";
    this.problems = problems;
  }
}

/** A failure with a message meant for the person at the terminal. */
export class CliError extends Error {}
