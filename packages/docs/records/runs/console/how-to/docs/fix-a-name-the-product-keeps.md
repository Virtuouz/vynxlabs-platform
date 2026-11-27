# Run log: console/how-to/docs/fix-a-name-the-product-keeps.md

- Instance http://localhost:8091, commit `14f7d5b9`, Maya Brooks, Sandbox, 1440 px, light.
1. In **Page details** set **Topic** to `build-docs` (a product topic). The problems panel said "The topic "build-docs" is one of the product's own. A page can add notes to it with extends: [build-docs], and cannot take its name." and "Mend these before it can be deployed." Setting `volvel-d31-test` gave the same words, with that id.
2. Saved. The Documentation screen showed "A page takes a term or a topic that the product's own help has, so a site leaves it out and a deploy is refused: d31-notes/walk-in. Give it another id in the page."
3. **Deploy**: refused. The error read "The bundle's manifests are not valid. d31-notes/walk-in (doc): The topic "build-docs" is one of the product's own. …"
4. Set **Topic** to `d31-walk-in` and saved: the notice was gone.
- Not run: a reserved term (only read in code), **Add this page's notes to**, 768 and 390 px, dark, keyboard only.
