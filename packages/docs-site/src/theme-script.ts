/**
 * The script that puts a reader's choice of light or dark on a docs page before it is painted. It
 * is loaded from the head, without `defer`, so that nothing is drawn until it has run. The choice
 * is `vd-theme` ("light" or "dark"; anything else is the system's). The product's own pages also
 * keep it where the console does, `vx-pref:theme`, which is read first so that the two stay in
 * step. Storage that cannot be read leaves the page to the system's setting.
 */
export const THEME_SCRIPT = `(function () {
  try {
    var choice = null;
    try {
      var kept = JSON.parse(localStorage.getItem("vx-pref:theme"));
      if (kept === "light" || kept === "dark") choice = kept;
    } catch (e) {}
    if (!choice) {
      try {
        var own = localStorage.getItem("vd-theme");
        if (own === "light" || own === "dark") choice = own;
      } catch (e) {}
    }
    if (choice) document.documentElement.dataset.theme = choice;
  } catch (e) {}
})();
`;
