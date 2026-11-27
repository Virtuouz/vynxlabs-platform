---
"@volvel/sdk": patch
---

### For operators

- **A provisioning connection lists its refusals in the order they were made.** Two pushes turned
  away in quick succession could be listed swapped, because each refusal took its time when it
  was written, after the answer had gone back to the directory.
