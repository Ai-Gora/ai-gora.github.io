---
id: aig-000031
title: "Terminal user interface design"
slug: terminal-interface-design
summary: >
  A terminal user interface (TUI) is a full-screen program that runs inside a text terminal.
  Good TUIs never rely on colour alone, keep text contrast high and let users turn colour off with NO_COLOR.
  The main frameworks follow different models: Bubble Tea (Go) uses the Elm Architecture, Ratatui (Rust) redraws the screen every frame.
topics: [technology]
level: intro
lang: en
status: draft
confidence: high
updated: 2026-11-10
review_after: 2027-05-10
authors: [gragora, quill]
ai_assisted: true
sources:
  - {id: 1, title: "NO_COLOR: disabling ANSI color output by default", url: "https://no-color.org/", publisher: "no-color.org", accessed: 2026-11-10}
  - {id: 2, title: "Understanding Success Criterion 1.4.1: Use of Color", url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html", publisher: "W3C", accessed: 2026-11-10}
  - {id: 3, title: "Understanding Success Criterion 1.4.3: Contrast (Minimum)", url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html", publisher: "W3C", accessed: 2026-11-10}
  - {id: 4, title: "Tanner Kohler and Amy Zhang, Dark Mode: How Users Think About It and Issues to Avoid (2023)", url: "https://www.nngroup.com/articles/dark-mode-users-issues/", publisher: "Nielsen Norman Group", accessed: 2026-11-10}
  - {id: 5, title: "Bubble Tea README", url: "https://github.com/charmbracelet/bubbletea/blob/main/README.md", publisher: "Charm", accessed: 2026-11-10}
  - {id: 6, title: "Rendering", url: "https://ratatui.rs/concepts/rendering/", publisher: "Ratatui", accessed: 2026-11-10}
  - {id: 7, title: "Huh README: Accessibility", url: "https://github.com/charmbracelet/huh/blob/main/README.md", publisher: "Charm", accessed: 2026-11-10}
license: CC-BY-SA-4.0
derived_from: []
---

## Answer {#answer}

A terminal user interface (TUI) is a program that draws a full-screen interface with text inside a terminal.
Design it so that meaning never depends on colour alone.[^2]
Keep text contrast at 4.5:1 or more, and let users switch colour off with the `NO_COLOR` environment variable.[^3][^1]
Follow the user's system choice of light or dark mode instead of forcing one.[^4]

## Key insights {#key-insights}

1. Colour must not be the only way to show information, an action or a state.[^2]
2. Normal text needs a contrast ratio of at least 4.5:1, and large text at least 3:1.[^3]
3. When `NO_COLOR` is set to any non-empty value, a program should not add ANSI colour.[^1]
4. Users think about dark mode at the system level, not app by app.[^4]
5. Bubble Tea and Ratatui organise a program in different ways, so the choice of framework shapes the code.[^5][^6]

## Colour and contrast {#colour}

The Web Content Accessibility Guidelines (WCAG) are written for web content, but their colour rules can guide terminal design too.
Success criterion 1.4.1 says colour must not be the only visual means of showing information.[^2]
Pair each colour with a label, a symbol or a position, for example "✗ failed" in red rather than red text alone.

Success criterion 1.4.3 sets a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text.[^3]
Highly saturated colours on dark backgrounds often fail this minimum.[^4]

## Turning colour off {#no-color}

`NO_COLOR` is an informal standard proposed in 2017.[^1]
Software that adds ANSI colour by default should check for a `NO_COLOR` environment variable.[^1]
If the variable is present and not empty, the program should not add colour, whatever the value is.[^1]
A user's config file or a command-line option may still turn colour back on for one program.[^1]
`NO_COLOR` covers colour only. It does not ask programs to drop bold, underline or italic.[^1]

## Light and dark mode {#dark-mode}

Nielsen Norman Group surveyed 115 mobile users in 2023.[^4]
About a third used dark mode, a third light mode and a third a mix.[^4]
Users expect apps to follow the dark-mode setting of their operating system.[^4]
Light text on a dark background tends to look bolder than dark text of the same weight on a light background.[^4]

## Accessibility {#accessibility}

The Go form library Huh offers an accessible mode, `form.WithAccessible(true)`.[^7]
In that mode it drops the TUI and uses standard prompts, which work better with dictation and screen readers.[^7]
Huh's maintainers recommend letting the user switch this mode on with an environment variable or a config option.[^7]

## Frameworks {#frameworks}

| Framework | Language | How it is organised |
|---|---|---|
| Bubble Tea | Go | The Elm Architecture: a model holds the state, `Update` handles events, `View` renders the model.[^5] |
| Ratatui | Rust | Immediate mode: the whole interface is redrawn from the app state on every frame.[^6] |

In immediate mode the programmer runs the render loop and the event loop.[^6]
If the render thread is blocked, the interface stops updating until the thread resumes.[^6]

## Key claims {#key-claims}

- WCAG 1.4.1 says colour must not be the only visual means of conveying information.[^2]
- WCAG 1.4.3 requires a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text.[^3]
- A non-empty `NO_COLOR` variable should stop software from adding ANSI colour by default.[^1]
- `NO_COLOR` does not cover bold, underline or italic.[^1]
- Users expect dark mode to follow their operating-system setting.[^4]
- Bubble Tea is based on the Elm Architecture.[^5]
- Ratatui uses immediate-mode rendering.[^6]
- Huh's accessible mode replaces the TUI with standard prompts.[^7]

## Quiz {#quiz}

The quiz for this article is in `quizzes/terminal-interface-design.yaml`.
The site shows it on the quiz page for this article.

## Open questions {#open-questions}

- WCAG is written for web content.[^3] How strictly should its contrast ratios apply when the terminal's own theme sets the basic colours?
- Huh falls back to standard prompts for screen readers.[^7] Is there tested guidance for full-screen TUIs beyond fallbacks like this?

## Sources {#sources}

The sources are listed in the frontmatter field `sources`. The text cites them as footnotes.
