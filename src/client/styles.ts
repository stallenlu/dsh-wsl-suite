/**
 * Third-party stylesheet injection for the WSL workspace UI (the plugin
 * builds no CSS bundle, so styles are injected as one idempotent `<style>`).
 *
 * Colour comes from the house design baseline (dsh-design-baseline, vendored
 * in `src/client/baseline.ts`): the six `--dsb-accent-*` for anything
 * meaningful (error, success, focus) and `--dsb-*` neutrals, which map back to
 * the host's `--dsw-alias-*` tokens. The plugin keeps its own `.dww-*` class
 * names — the baseline is a palette and a set of component classes, not a
 * naming scheme — and the dialog root carries `dsb-root` so the baseline
 * variables resolve on an element the host's dark-theme selector can reach.
 *
 * Shell chrome (the footer button, the header entry) stays on `--dsw-*`
 * directly: it has to look like the host's own icon buttons, not like a panel.
 */

const STYLE_TAG_DATA_ATTRIBUTE = 'data-plugin="dsh-wsl-suite"'

const STYLES = `
/* Sidebar-foot icon action beside Settings (28px round in the wide sidebar,
   36px round in the rail), matching the shell's icon-button language. */
.dww-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #61666b);
  transition:
    background-color 120ms ease-in-out,
    color 120ms ease-in-out;
}
.dww-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
  color: var(--dsw-alias-label-secondary, #61666b);
}
.dww-action:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #2631480f);
}
.dww-action:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #3b82f6);
  outline-offset: 1px;
}
.dww-action:disabled { cursor: default; opacity: 0.6; }
.dww-action--rail {
  width: 36px;
  height: 36px;
}
/* Same box as the shell's own footer actions: the base rule's 50% radius resolves per axis,
   so a wide box needs the length restated or it draws an ellipse. */
.dww-action--wide {
  flex: 0 0 auto;
  width: 100%;
  height: 42px;
  padding: 0 10px 0 8px;
  justify-content: flex-start;
  border-radius: 12px;
  font-size: 14px;
  line-height: 22px;
  white-space: nowrap;
}
/* The base rule is the dimmed rail tone. */
.dww-action--rail,
.dww-action--wide { color: var(--dsw-alias-label-primary, #0f1115); }
.dww-action svg { flex: none; }

/* The W letter mark of the sidebar action (sized for wide/rail buttons). */
.dww-letter {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  user-select: none;
}
.dww-action--rail .dww-letter { font-size: 17px; }
/* The neighbours start their label at 8 + 16 + 8; a 16px box centres the W on that line. */
.dww-action--wide .dww-letter {
  flex: none;
  width: 16px;
  margin-right: 8px;
  text-align: center;
}

/* Full-viewport overlay + centered card (mirrors the platform Mask/Dialog).
   The overlay carries dsb-root: the baseline resolves its neutrals on that
   element, which is also what keeps the dark theme honest. */
.dww-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dww-overlay-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
  backdrop-filter: var(--dsw-mask-blur, blur(8px));
}
.dww-card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(440px, 100%);
  max-height: min(640px, 90vh);
  padding: 0 0 18px;
  overflow: hidden;
  border: 1px solid var(--dsb-line-strong);
  border-radius: var(--dsb-radius);
  background: var(--dsb-surface);
  color: var(--dsb-text);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0, 0, 0, 0.18));
  font-family: var(--dsb-font);
}
.dww-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 18px 10px;
}
.dww-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: -0.01em;
  color: var(--dsb-text);
}
.dww-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--dsb-radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--dsb-text-secondary);
}
.dww-close:hover { background: var(--dsb-hover); color: var(--dsb-text); }
.dww-body {
  display: flex;
  flex-direction: column;
  gap: var(--dsb-gap);
  min-width: 0;
  padding: 0 18px;
  overflow: auto;
}
.dww-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dww-field-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsb-text-secondary);
}
.dww-select {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--dsb-line-strong);
  border-radius: var(--dsb-radius-sm);
  background: var(--dsb-surface-3);
  color: var(--dsb-text);
  font-size: 13px;
}
.dww-input {
  box-sizing: border-box;
  flex: 1;
  height: 34px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--dsb-line-strong);
  border-radius: var(--dsb-radius-sm);
  background: var(--dsb-surface-3);
  color: var(--dsb-text);
  font-size: 13px;
}
/* Focus is an accent, not a surface change: blue is the baseline's "active"
   colour and the only saturated thing in an otherwise neutral panel. */
.dww-input:focus, .dww-select:focus {
  outline: none;
  border-color: var(--dsb-accent-speed);
}

/* Directory browse list. */
.dww-dirlist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  min-height: 120px;
  max-height: 200px;
  padding: 4px;
  overflow: auto;
  border: 1px solid var(--dsb-line);
  border-radius: var(--dsb-radius-sm);
  background: var(--dsb-surface-2);
}
.dww-feedback {
  /* The browse block: the path above the listing, as one visual group. */
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dww-breadcrumb {
  padding: 0 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsb-text-tertiary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dww-dir-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsb-text);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.dww-dir-row:hover:not(:disabled) { background: var(--dsb-hover); }
.dww-dir-row:disabled { cursor: default; color: var(--dsb-text-tertiary); }
.dww-dir-row--up { color: var(--dsb-text-secondary); }
.dww-dir-row svg { flex: none; color: var(--dsb-text-tertiary); }
.dww-dir-empty {
  padding: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsb-text-tertiary);
}

/* Feedback strips. Colour is meaningful here, so both take an accent and a
   15% wash of it — the same treatment the baseline gives a chip. */
.dww-error {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dsb-accent-error) 45%, transparent);
  border-radius: var(--dsb-radius-sm);
  background: var(--dsb-wash-error);
  color: var(--dsb-accent-error);
  font-size: 12px;
  line-height: 18px;
}
.dww-done {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dsb-accent-stability) 45%, transparent);
  border-radius: var(--dsb-radius-sm);
  background: var(--dsb-wash-stability);
  color: var(--dsb-accent-stability);
  font-size: 12px;
  line-height: 18px;
}

/* Dialog footer actions. Primary is inverted, not coloured: colour is
   reserved for state, which is the one rule the baseline will not bend. */
.dww-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px 0;
}
.dww-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsb-line-strong);
  border-radius: var(--dsb-radius-sm);
  background: transparent;
  color: var(--dsb-text);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
}
.dww-btn:hover:not(:disabled) { background: var(--dsb-hover); }
.dww-btn--primary {
  border-color: transparent;
  background: var(--dsb-inverted-bg);
  color: var(--dsb-inverted-fg);
}
.dww-btn--primary:hover:not(:disabled) { background: var(--dsb-inverted-bg); opacity: 0.9; }
.dww-btn:disabled { cursor: default; opacity: 0.45; background: transparent; }

/* The footer row stays mounted in a wide sidebar because the header entry
   discovers its seat from it; it is hidden, not removed, once that entry is
   in place. (A class rule beats the UA's [hidden] display:none.) */
.dww-action[hidden] { display: none !important; }

/* The header entry: the add control's own class list carries the box, so this
   seat only groups it with the strip. The strip caps at 60px for two 28px
   controls, so one more control needs the cap widened; the search-expanded
   state must still collapse it. */
.dww-header-slot {
  display: flex;
  flex: none;
  align-items: center;
}
[class*='_headerActions']:has(.dww-header-entry) { max-width: 92px; }
[class*='_headerActions'][class*='_headerActionsHidden']:has(.dww-header-entry) { max-width: 0; }
`

/**
 * Idempotently inject the plugin stylesheet. No-op when a tag with the
 * plugin's data attribute already exists.
 */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${STYLE_TAG_DATA_ATTRIBUTE}]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'dsh-wsl-suite')
  style.textContent = STYLES
  document.head.appendChild(style)
}
