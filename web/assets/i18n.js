// UI strings by page language, used by the build (Node) and the browser (no DOM access here).
// Slovenian strings marked "Quill" in the PR need a native check.
export const UI_LANGS = ['en', 'sl'];

// Slovenian plural forms: 1, 2, 3–4, other (also 101, 102, …).
const slForm = (n) => { const h = n % 100; return h === 1 ? 0 : h === 2 ? 1 : h === 3 || h === 4 ? 2 : 3; };
const plural = (lang, n, forms) => (lang === 'sl' ? forms[slForm(n)] : forms[n === 1 ? 0 : 1]);

export const STRINGS = {
  en: {
    skip: 'Skip to content', navSite: 'Site', navHome: 'Home', navSearch: 'Search', navPaths: 'Lesson paths', navQuizzes: 'Quizzes',
    siteSearch: 'Site search', searchArticles: 'Search articles', searchPlaceholder: 'Search', searchButton: 'Search',
    footerContent: 'Content', footerCode: 'Code', footerSource: 'Source on GitHub',
    languages: 'Languages', language: 'Language', allLanguages: 'All languages',
    level_intro: 'Intro', level_core: 'Core', level_deep: 'Deep',
    status_draft: 'draft', status_reviewed: 'reviewed', status_stale: 'stale',
    confidence_low: 'low', confidence_medium: 'medium', confidence_high: 'high',
    inShort: 'In short:', draftLabel: 'Draft:', draftText: 'this article has not been reviewed yet.',
    staleLabel: 'Stale:', staleText: 'this article is due for review and may be out of date.',
    metaStatus: 'Status', metaConfidence: 'Confidence', metaUpdated: 'Updated', metaReviewAfter: 'Review after', metaAuthors: 'Authors', aiAssisted: '(AI-assisted)',
    readFirst: 'Read first', contents: 'Contents', takeQuiz: 'Take the quiz on {title}', whatLinksHere: 'What links here', noBacklinks: 'No other articles link here yet.',
    licence: 'Licence', markdownSource: 'Markdown source', history: 'History', accessed: 'accessed', sourceN: 'Source {n}',
    diagram: 'Diagram', diagramSource: 'Diagram source',
    quizTitle: 'Quiz: {title}', quizIntro: 'Questions about {link}. Each answer links back to the section it comes from.',
    true: 'True', false: 'False', showAnswer: 'Show answer', answer: 'Answer:', read: 'Read:', yourAnswer: 'Your answer',
    orderHint: 'Put these in order, separated by commas:', checkAnswers: 'Check answers', startAgain: 'Start again',
    quizNoscript: 'Use “Show answer” under each question to check yourself.',
    correct: '✓ Correct.', notQuite: '✗ Not quite. See the answer below.', notAnswered: '✗ Not answered. See the answer below.',
    score: 'You got {right} of {total} right.', loadAnswersFailed: 'Could not load the answers. Use “Show answer” instead.',
    yourScore: 'your score {right}/{total}',
    pathsTitle: 'Lesson paths', pathsIntro: 'Choose an interest to get an ordered reading list. Prerequisites come first, then articles from intro to deep.',
    pathTitle: 'Lesson path: {title}', readingOrder: 'Reading order', prerequisite: 'prerequisite', sections: 'Sections',
    noPathArticles: 'No articles for this interest yet.', relatedInterests: 'Related interests', quiz: 'Quiz',
    articleStatus: 'Article status', metaChecked: 'Checked', metaNextReview: 'Next review', aiAssistedShort: 'AI-assisted',
    dueLabel: 'Review due:', dueText: 'this article was due for review on {date}.',
    stepsDone: '{count} of {total} steps done', continueTo: 'Continue: {title}', stepDone: '(done)',
  },
  sl: {
    skip: 'Preskoči na vsebino', navSite: 'Spletno mesto', navHome: 'Domov', navSearch: 'Iskanje', navPaths: 'Učne poti', navQuizzes: 'Kvizi',
    siteSearch: 'Iskanje po spletnem mestu', searchArticles: 'Iskanje po člankih', searchPlaceholder: 'Iskanje', searchButton: 'Išči',
    footerContent: 'Vsebina', footerCode: 'Koda', footerSource: 'Izvorna koda na GitHubu',
    languages: 'Jeziki', language: 'Jezik', allLanguages: 'Vsi jeziki',
    level_intro: 'Uvod', level_core: 'Osnove', level_deep: 'Poglobljeno',
    status_draft: 'osnutek', status_reviewed: 'pregledano', status_stale: 'zastarelo',
    confidence_low: 'nizka', confidence_medium: 'srednja', confidence_high: 'visoka',
    inShort: 'Na kratko:', draftLabel: 'Osnutek:', draftText: 'tega članka še nihče ni pregledal.',
    staleLabel: 'Zastarelo:', staleText: 'ta članek je treba ponovno pregledati in je morda zastarel.',
    metaStatus: 'Stanje', metaConfidence: 'Zanesljivost', metaUpdated: 'Posodobljeno', metaReviewAfter: 'Pregled po', metaAuthors: 'Avtorji', aiAssisted: '(s pomočjo UI)',
    readFirst: 'Najprej preberite', contents: 'Vsebina', takeQuiz: 'Rešite kviz: {title}', whatLinksHere: 'Povezave na ta članek', noBacklinks: 'Na ta članek se še ne povezuje noben drug članek.',
    licence: 'Licenca', markdownSource: 'Izvorno besedilo (Markdown)', history: 'Zgodovina', accessed: 'dostop', sourceN: 'Vir {n}',
    diagram: 'Diagram', diagramSource: 'Izvorna koda diagrama',
    quizTitle: 'Kviz: {title}', quizIntro: 'Vprašanja o članku {link}. Vsak odgovor se povezuje na razdelek, iz katerega izhaja.',
    true: 'Drži', false: 'Ne drži', showAnswer: 'Pokaži odgovor', answer: 'Odgovor:', read: 'Preberite:', yourAnswer: 'Vaš odgovor',
    orderHint: 'Razvrstite po vrsti, ločeno z vejicami:', checkAnswers: 'Preveri odgovore', startAgain: 'Začni znova',
    quizNoscript: 'Pod vsakim vprašanjem izberite »Pokaži odgovor« in preverite svoje znanje.',
    correct: '✓ Pravilno.', notQuite: '✗ Ni pravilno. Odgovor je spodaj.', notAnswered: '✗ Brez odgovora. Odgovor je spodaj.',
    score: 'Pravilni odgovori: {right} od {total}.', loadAnswersFailed: 'Odgovorov ni bilo mogoče naložiti. Uporabite »Pokaži odgovor«.',
    yourScore: 'vaš rezultat {right}/{total}',
    pathsTitle: 'Učne poti', pathsIntro: 'Izberite področje in dobite urejen seznam za branje. Najprej so predznanja, nato članki od uvodnih do poglobljenih.',
    pathTitle: 'Učna pot: {title}', readingOrder: 'Vrstni red branja', prerequisite: 'predznanje', sections: 'Razdelki',
    noPathArticles: 'Za to področje še ni člankov.', relatedInterests: 'Sorodna področja', quiz: 'Kviz',
    articleStatus: 'Stanje članka', metaChecked: 'Preverjeno', metaNextReview: 'Naslednji pregled', aiAssistedShort: 's pomočjo UI',
    dueLabel: 'Pregled zapadel:', dueText: 'ta članek bi moral biti ponovno pregledan {date}.',
    stepsDone: 'Opravljeni koraki: {count} od {total}', continueTo: 'Nadaljuj: {title}', stepDone: '(opravljeno)',
  },
};

const PLURALS = {
  articles: { en: ['{n} article', '{n} articles'], sl: ['{n} članek', '{n} članka', '{n} članki', '{n} člankov'] },
  questions: { en: ['{n} question', '{n} questions'], sl: ['{n} vprašanje', '{n} vprašanji', '{n} vprašanja', '{n} vprašanj'] },
};

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
export const uiLang = (lang) => (STRINGS[lang] ? lang : 'en');

/** t('sl', 'score', { right: 1, total: 2 }); unknown language falls back to English, unknown key to the key. */
export function t(lang, key, vars = {}) {
  const l = uiLang(lang);
  return fill(STRINGS[l][key] ?? STRINGS.en[key] ?? key, vars);
}

/** tn('sl', 'articles', 3) -> '3 članki'. */
export function tn(lang, key, n) {
  const l = uiLang(lang);
  return fill(plural(l, n, PLURALS[key][l]), { n });
}
