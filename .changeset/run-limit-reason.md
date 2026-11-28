---
"@volvel/sdk": patch
---

### For operators

- **A run that overruns its time limit says so.** It is failed with "The run took longer than its
  limit", as it always should have been. On a busy instance the queue could give up on the run at
  the same moment as the worker ended it, and when the queue was first the worker's report was
  refused: the run waited for the reaper and was failed as "timed out, or its worker stopped
  responding", which was not what happened. The queue now waits 30 seconds past the limit before
  it gives up on a run, which only matters when a worker has gone.
