(function (root) {
  function apply(theme) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selected;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = selected === "dark" ? "#17231e" : "#f4f6f2";
    try {
      root.SoftHomeNative?.setTheme(selected);
    } catch {}
  }
  root.SoftHomeAppearance = { apply };
  let theme = "light";
  try {
    theme = localStorage.getItem("softhome_theme") || theme;
  } catch {}
  apply(theme);
})(window);
