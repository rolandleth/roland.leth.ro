// One of two sanctioned homes for `dangerouslySetInnerHTML` (see
// eslint.config.mjs). A raw inline <script> that must run *synchronously during
// HTML parsing, before first paint*, to set the theme class — otherwise a
// dark-mode visitor sees a white flash. `next/script` (even
// `beforeInteractive`) runs a tick later and flashed, so this is a plain inline
// script rendered directly into the document instead.
//
// The body is a static, self-authored string with no interpolated data (no
// injection surface). It mirrors `readStoredTheme` in lib/client/theme.ts —
// duplicated because it must execute before any module loads and so can't
// import that file.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((t===null||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){document.documentElement.classList.add('light')}})()`

export default function ThemeScript() {
	return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
}
