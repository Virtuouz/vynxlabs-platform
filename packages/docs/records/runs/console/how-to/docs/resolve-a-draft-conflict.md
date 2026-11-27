# Run log: console/how-to/docs/resolve-a-draft-conflict.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light. Two tabs of one signed-in person on the page `d31-notes/walk-in`.
1. Both tabs opened the page. The second typed "Their line." and pressed Ctrl+S (saved).
2. The first typed "My line." and pressed Ctrl+S. The banner "Someone else saved this page after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." appeared, with **Copy what I wrote** and **Load their version**. **Unsaved changes** was shown and **Save draft** stayed enabled.
3. **Load their version** opened "Load their version? What you changed since you opened the page is replaced by what they saved. Copy it first if you want to keep it." with **Load theirs**. After it the source ended "...Their line." and the banner was gone.
- Not run: **Copy what I wrote** (the clipboard was not read), the final **Save draft** after merging, two different people, 768 and 390 px, dark, keyboard only. The screenshot `docs/draft-conflict` is asked for in `docs/documentation/shots/docs.json`.

## The page got wrong
- A first draft said "Undo may bring back" what was replaced; the code does not say, so the page now says only to copy first. A bullet about the tree of pages' refusal was dropped: the tree reads the latest revision when it sends.
