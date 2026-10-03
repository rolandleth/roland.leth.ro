# Product page for own apps: design handoff

Written 2026-09-30. Site: roland.leth.ro, the personal site of Roland Leth (landing page, blog, guides, projects portfolio).

## 1. The job

Design a product-style layout for one page type: the project page of an app Roland makes and sells himself (`/projects/<slug>`). Today that page is a portfolio entry with tabs. It must become a page that can hold full landing copy for an app, sell the app, and be read in full by search engines and AI answer engines.

Three apps use it:

| App | What it is | Platform | State |
|---|---|---|---|
| Reckon | Decision journal | iPhone, iPad | Live on the site |
| Continuum | 1:1 and direct-report notes for managers | Mac | Live on the site |
| Digest | Food and symptom journal | iPhone, iPad | About to launch. Its copy is the long case this design is sized for. |

The page stays inside the portfolio site. It keeps the site header and footer. It is not a standalone landing page on its own domain.

## 2. Why the current page fails

Checked on the live Reckon page on 2026-09-30.

1. **Sections are tabs, and only the open tab is in the HTML.** A crawler or an AI engine gets the first section's text and nothing from the others.
2. **Prices exist only in structured data.** No price is printed on the page. Search engines expect markup to match what a reader can see.
3. **The `h1` is the app name alone.** Nothing in a heading says what the app is. Section titles are tab buttons, so the page has no `h2` until "Guides".

## 3. Scope

In scope:

- The layout of the project page for own apps, phone first, light and dark.
- The slots in section 6, in whatever order and arrangement reads best.

Out of scope:

- Project pages for client work and other projects. They keep the current tabbed layout.
- The site header, footer, gallery page and blog.
- Rewriting copy. Design with the real copy in the appendices.
- Anything the site has no data for: ratings, reviews, testimonials, press logos, user counts, feature icons, video, email capture.

The database schema and the import script can change to suit the design. If the design needs a slot that section 6 does not list, name it as a requested field. Do not fill it with invented content.

## 4. Hard requirements

These are decided. The design works inside them.

**Structure and text**

- Every section is on the page at once, stacked, with its full text in the HTML. No tabs. No pattern that removes text from the page until the reader acts.
- Each section has its own `h2` and an anchor id, so a link can point at it.
- One `h1`. It holds the app name and, when the project has them, an eyebrow line and a headline. All three are text in the same heading element. Their order and visual weight are a design choice.
- Heading order: `h1`, then `h2` for each section and for the price, FAQ and guides blocks, then `h3` inside them (numbered steps, FAQ questions, guide titles). No skipped levels. A heading is never used only for its look.
- Anything a reader must know is text, never only inside an image.

**Content that must be visible**

- The first screen on a phone says what the product is in plain category words and shows the store button.
- Prices, as text, one entry per offer.
- A closing call to action after the content.
- A "Last updated" date.
- The FAQ and the guides block, which exist today.

**Images**

- Every section image has the same shape: 1270 × 760, a ratio of about 1.67 to 1. The layout reserves that space, so nothing moves when an image loads.
- Only the first image on the page loads with priority. All others load lazily.
- One lightbox covers every image on the page. It exists today and is not part of this design.

**Platform**

- Phone first. No horizontal page scroll at 375px wide. A table inside a section needs a plan for that width.
- Light and dark themes.
- Tap targets at least 24px.
- Motion lasts 0.2 to 0.3 seconds, respects the reduced-motion setting, and the page reads in full without JavaScript.
- The App Store badge is Apple's artwork. It is used as supplied, in its light and dark versions, with its clear space.

## 5. The site as it is

**Stack.** Next.js, Tailwind CSS v4, Framer Motion. Section bodies are markdown rendered into Tailwind Typography (`prose`): paragraphs, links, lists, `h3`, tables.

**Type.** Headings use Newsreader (serif). Body text uses Inter. Code uses JetBrains Mono.

**Colour tokens.**

| Token | Light | Dark |
|---|---|---|
| Primary text | `#030712` | `#f5f5f5` |
| Secondary text | `#565d6b` | `#9ca3af` |
| Background | `#f9fafb` | `#030712` |
| Border | `#e5e7eb` | `#1f2937` |
| Default accent | `#0d8fb5` | `#12a8da` |

**Accent per project.** Each project has one accent colour. It tints the site header, a soft glow at the top of the page, the platform chip, the border of link pills, the "Guides" and "FAQ" headings and the FAQ chevrons. The same hex is used in both themes, so it must hold contrast on both backgrounds.

| App | Accent |
|---|---|
| Reckon | `#B5673F` |
| Continuum | `#5B6FA8` |
| Digest | Not set yet. Its screenshots use a deep green ground with white type and a gold italic accent. |

**Page column.** 768px wide at most, 16px side gutters, 80px top and bottom padding. The design may change the width for this layout; see section 8.

**The current project page, top to bottom.**

1. Identity row: app icon (72px, rounded), name as `h1`, a platform chip ("iOS, iPad") and the role ("Sole developer"). On the right, the links.
2. Summary paragraph, large, secondary colour.
3. A tab row of section titles, then one panel: an image carousel and the section's text.
4. The store button again, centred.
5. "Guides": a list of guide hubs that name this app, each with a title, one line and a count ("10 guides").
6. "FAQ": an accordion. Several answers can be open. Closed answers stay in the HTML.

**Link rules, already built.**

- An own app with exactly one store link shows Apple's badge ("Download on the App Store" or the Mac App Store one).
- An own app with several store links shows "Download on {label}" pills.
- Any other link is a plain pill with its label.
- A discontinued app shows a "Discontinued" chip by the name and no store button.

**Carousel, already built.** A stage at the image ratio with rounded corners. Swipe on touch. Dots under the stage when a section has more than one image. A small centred caption under the image. Tap to open the lightbox. No arrows on the page.

**Motion today.** The hero, the content, the guides and the FAQ fade up once on page load, with short delays.

## 6. Content model

"Planned" fields are not built yet. They are what the copy needs, and the design can change the list.

**Project**

| Slot | Status | Limit | Notes |
|---|---|---|---|
| Name | Exists | 80 chars | "Digest" |
| Icon | Exists | | Square app icon |
| Summary | Exists | 300 chars | One paragraph. Also the meta description. It plays the subhead. |
| Platform chip and role | Exists | | "iOS, iPad", "Sole developer" |
| Accent colour | Exists | | One hex |
| Links | Exists | Label 60 chars | 1 to 3. A store link, and sometimes Privacy and Support. |
| Offers | Exists | Name 60 chars | 1 to 4. Each has a name, a price and a currency. |
| Hero image | Exists | | Optional. Today it shows only when a project has no sections. |
| Updated date | Exists | | Set on every save |
| Hero eyebrow | Planned | About 80 chars | The category phrase. Optional. |
| Hero headline | Planned | About 80 chars | The hook. Optional. |
| Store-button note | Planned | About 120 chars | One line under the store button, in the hero and in the closing. Optional. |
| Closing headline | Planned | About 80 chars | Optional |
| Closing body | Planned | About 200 chars | Optional |
| Hero image alt | Planned | | Optional |

**Sections** (3 to 12 per project, in a set order)

| Slot | Status | Limit | Notes |
|---|---|---|---|
| Title | Exists | 200 chars | Becomes the `h2` |
| Body | Exists | Markdown | 1 to 4 short paragraphs. Can hold `h3` steps, a list, a table, links. |
| Images | Exists | | 0 to 4, all 1270 × 760 |
| Image caption | Exists | 300 chars | Shown under the image. Today it is also the alt text. |
| Image alt | Planned | | Separate from the caption, so a long description is not printed under the image |
| "Holds the price list" flag | Planned | | Marks the section that the price list prints inside. With no marked section, the price list is its own block. |

**FAQ**: 7 to 9 questions (300 chars each) with markdown answers of 2 to 4 sentences.

**Guides**: none, or a few hubs. Each has a title, one line and a guide count.

## 7. The three cases

Design the long case first, then check the short one.

| | Reckon | Continuum | Digest |
|---|---|---|---|
| Hero eyebrow and headline | None yet | None yet | Both |
| Sections | 3 | 3 | 12 |
| Images per section | 4, 1, 1 | 4, 1, 1 | 6 sections with 1, 6 with none |
| Image-less sections in a row | 0 | 0 | 4 |
| Special bodies | None | None | One section with 3 numbered steps, one with a 3-column table |
| Offers | 1 | 4 | 4 |
| Links | App Store | Mac App Store | App Store, Privacy, Support |
| FAQ | 7 | 7 | 9 |
| Guides | 1 hub | Some | None yet |
| Closing copy | None | None | Headline, body, note |
| Disclaimer | None | None | Health disclaimer |

Offers, as they would print:

- Reckon: One-time purchase, $3.99.
- Continuum: Free (up to 3 people), $0. Monthly, $12. Yearly, $108. Lifetime, $249.
- Digest: Free, $0. Insights at $6.99 a month, $39.99 a year or $89.99 once.

All prices are US prices. A short line must say that the App Store shows the reader's own price.

Reckon and Continuum keep a bare-name `h1` until someone writes a hero line for them. The design must look finished in that state too.

## 8. Open design questions

Each has the facts and, where there is one, a current leaning. The leanings are not decisions.

1. **In-page navigation.** None, a row of section links under the hero, or a sticky one. A project has 3 to 12 sections and Digest's titles are long ("Most of what you eat looks fine so far"). Leaning: none. A row of 12 long titles scrolls sideways on a phone and hides most of them.
2. **Hero.** Where the icon, name, eyebrow, headline, summary, store button, note, other links and hero image sit, on a phone and on a desktop. The name, eyebrow and headline share one `h1`.
3. **Secondary link in the hero.** Digest's copy asks for "See how it works", a link to a section. There is no field for it. If the hero has one, say what it points at by rule, or ask for a field.
4. **Section layout.** How an image and its text sit together, and how the page keeps a rhythm across 12 sections when half have no image and four of those come in a row.
5. **The steps section.** "How it works" holds three numbered `h3` steps and one image. The numbers are a real sequence.
6. **The table.** "Free and paid" is a 3-column table with long cells. It needs a form that works at 375px.
7. **Price list.** Its shape for one offer and for four. It prints inside the marked section when there is one, and as its own "Pricing" block before the FAQ when there is none. Both need a design.
8. **Closing block.** Icon, name, closing headline, closing body, store button and note. Each of the text slots can be empty.
9. **Order of the lower page.** Leaning: sections, price, FAQ, closing, guides, updated date. The reader who is deciding goes from price to objections to the button without a break, and the guides are further reading.
10. **Secondary links.** Privacy and Support are pills in the hero today. They may belong near the bottom.
11. **Disclaimer.** Digest has a one-line health disclaimer. It can be the end of its last section or a slot of its own near the updated date.
12. **Captions.** Whether a caption still prints under each image once alt text is separate.
13. **Column width.** 768px today. A wider page or a wider hero is allowed if the text lines stay under about 80 characters.
14. **Motion.** Leaning: one page-load sequence in the hero and nothing on scroll. Twelve sections that each fade in read as decoration.

## 9. Images

- Section images for Reckon and Continuum are finished compositions: a headline and a few lines of text on the left, a device on the right, on a light ground.
- Digest's images will be stitched from its App Store frames at the same 1270 × 760 shape. Three trial stitches exist: two with three frames side by side and one with two. Each frame has its own headline in white and gold italic on deep green.
- **Legibility on a phone.** A three-frame stitch shown 343px wide gives each frame about 114px. The text inside cannot be read without the lightbox. One or two frames per image is the workable limit for a section image.
- **Headlines inside images.** A frame's headline often equals the section title printed above it. A three-frame stitch also carries headlines that belong to other sections. The three-frame stitch suits the hero and the social card. A section image should show that section's frame only.
- Images carry text, so the design must not rely on an image to say something the page text does not.

## 10. States to cover

- Hero with name only, with name and eyebrow, with all three.
- Hero with and without a hero image.
- One store link (Apple's badge), and two store links (pills).
- Store-button note present and absent.
- Section with 4 images, with 1 image, with none.
- Section with numbered steps. Section with a table, at 375px.
- Price list with 1 offer and with 4, inside a section and as its own block.
- Project with no offers: no price list at all.
- Closing block with its text slots filled and empty.
- No guides. No FAQ is rare but possible.
- Light and dark, with a warm accent (`#B5673F`) and a cool one (`#5B6FA8`).

## 11. What to hand back

- Digest, the long case: phone (375px) and desktop, light and dark.
- Reckon, the short case with no hero line and one offer: phone and desktop.
- The states in section 10 that those two pages do not show.
- Spacing, type sizes and colours in the site's tokens where they fit, and a list of any new ones.
- A list of every data slot the design uses that section 6 does not have.
- An answer to each question in section 8.

## Appendix A: Digest copy

Snapshot of `~/_Work/projects/digest/product/copy/landing-page.md` on 2026-09-30. That file is the source; this copy can go stale.

Search facts: the page answers two queries, "Digest" and "food and symptom journal app". The title is "Digest: Food and Symptom Journal for iPhone".

### Hero

**Eyebrow:** Food and symptom journal for iPhone and iPad

**Headline:** Find which foods to suspect

**Subhead:** Digest is a food and symptom journal. You log meals in plain words and log how you feel, and it counts every food across the meals with it and the meals without it. A few weeks in, you have a short list of suspects and a longer list of what looks fine so far, each with the meals behind it.

**Primary CTA:** Download on the App Store
**CTA subtext:** Logging is free, forever. iPhone and iPad.
**Secondary CTA:** See how it works

**Visual:** the `suspects` frame.
**Alt text:** 4 cards from Digest: onion, a strong suspect, with bloating after 9 of 11 meals with it and 7 of 52 without; milk, emerging; garlic, still watching; salmon, fine so far.

### Guessing cuts too much

Something you eat keeps disagreeing with you. That's common: about 14% of US adults report bloating in any given week ([a 2022 survey of 88,795 people](https://www.cghjournal.org/article/S1542-3565(22)01020-5/fulltext)). The usual next step is to cut a food group and see. Dairy goes, then coffee, then onion.

A guess takes out more than it needs to, and it can't tell you which of the three did anything. Memory isn't much better, since it blames the last meal, and the meal that matters can be hours back. Digest looks 6 hours before bloating and 2 days before a stool change.

Digest keeps what's fine and looks closer at what isn't.

**Visual:** the `guess` frame.
**Alt text:** A guess that cuts dairy, coffee and onion and still isn't sure which, above a journal that marks milk as an emerging suspect, coffee as fine so far and onion as a strong suspect.

### How it works

**1. Log a meal in 10 seconds**

Type "two eggs and toast around 8" and Digest reads it into foods and a time, which you check before saving. There are no calories to count, nothing to weigh and no food database to search, only colored dots that mean what you decide they mean. Templates cover the meals you repeat, and widgets and Lock Screen controls open the log sheet in one tap.

**2. Then how you feel**

When something's off, log the symptom and how bad it is. Bloating, gas, reflux, cramps and nausea are there from the start, stools have their own log, and you can add a symptom of your own.

**3. A few weeks later**

Digest looks back from each symptom over the hours before it (3 for reflux, 6 for bloating, 2 days for a stool change) and notes what you ate. Then it compares every food against your own meals without it.

**Visual:** the `log` frame.
**Alt text:** Digest's Today screen with the meal sheet open, reading "two eggs and toast around 8" into Eggs, Toast and 8:00 AM.

### Every suspect shows its work

A suspect opens onto the meals behind it: when you ate, what followed and how long after. The counts sit on top, with the food and without it. Bloating after 9 of 11 meals with onion means little on its own; next to 7 of 52 meals without, it means a lot.

If you know one of those pairings was something else, throw it out and the numbers recalculate. The time window for each symptom is adjustable too, and everything recalculates from there.

**Visual:** the `evidence` frame.
**Alt text:** Onion's evidence in Digest: bloating followed 9 of 11 meals with onion and 7 of 52 without, over the list of meals it followed.

### It waits for the evidence

One rough night after pizza means nothing on its own. A food needs at least 5 meals, with symptoms after meals at least a week apart, before Digest names it. Until then the food sits at watching, and its card says what it's short of, down to the number of meals.

So expect little in the first week and a clear suspect by the third. A food you eat with almost every meal has nothing to be compared against, and Digest says that too instead of guessing.

**Visual:** the `then-and-now` frame.
**Alt text:** Onion after 7 days, still at watching after 3 of its 4 meals, and after 21 days, a strong suspect after 9 of 11 meals with it against 7 of 52 without.

### Most of what you eat looks fine so far

Most trigger hunts only ever tell you what to cut. Digest also keeps a list of what looks fine, counted the same way as every suspect, and if you've been dropping foods on suspicion that's the list that gives them back.

It says "so far" on purpose. It's a reading of your journal, and it can change in either direction as you keep logging.

**Visual:** the `fine-so-far` frame.
**Alt text:** Digest's fine-so-far list: salmon, rice, coffee, spinach, eggs and toast, each with its count of meals with and without.

### Test a suspect

A suspect list tells you where to look. The test that settles it is an old one: stop eating the food for a while, then eat it again and see whether the symptom comes back. Digest runs it with you. Pick 1 to 3 weeks, keep logging as usual and put the food back on 3 days at the end. An accidental bite adds a day, it doesn't reset anything.

### Foods that share something

Milk arrives in your coffee, in rice pudding and in mashed potatoes, and none of the three gets logged often enough to build a case. Tag what a food contains (dairy, gluten, caffeine) and those meals count together. If you can't name what a few dishes share, link them, and Digest counts the link like a food.

### When it isn't the food

A stomach bug, an exam or a medication dose says nothing about food. Mark a symptom as not from food, or a stretch of days as unwell, and Digest leaves those meals out of its findings and keeps them in your journal.

### Each week, and on one page

Once a week there's a short letter on the last 7 days: what moved, what new evidence landed, which days went unlogged and one thing worth testing next. A week where nothing moved gets a letter that says exactly that. The report puts what your journal shows on one page, as a PDF.

### Yours, on your phone

Everything you log is stored on your device. There's no Digest account, no sign-up and no server of ours: the engine runs on your iPhone or iPad and nothing is sent away to be analyzed. There's no analytics in the app either.

Your journal syncs through your own iCloud account, the way Notes and Photos do, and sync is free. You can export all of it as CSV or JSON whenever you want. Cycle and weight can sit next to your log from Apple Health; Digest only reads them and never copies them into your journal.

**Visual:** the `yours` frame.
**Alt text:** 4 facts about Digest: no account, iCloud sync between your devices, export as CSV or JSON, logging is free forever.

### Free and paid

| | Free, forever | Insights |
|---|---|---|
| What you get | Meals, symptoms and stools. History and the day timeline. Templates, widgets and reminders. iCloud sync. CSV and JSON export. | Suspects and their evidence. What looks fine so far. A guided test for any suspect. The weekly letter. The one-page report. |
| Price | $0 | $6.99 a month, $39.99 a year or $89.99 once |

Digest offers Insights when your journal has enough to read, never at install. Prices are for the US; the App Store shows yours.

(The price row will come out of this table. The price list prints the same numbers from the offers.)

### What Digest doesn't do

Digest is a journal with a correlation engine attached. It notices patterns in what you logged; it can't tell you why a pattern is there, and it doesn't diagnose anything. A food on the suspect list is worth testing, not proven guilty. It also only knows what you tell it: stress, sleep and medication aren't weighed.

Digest is not a medical device and nothing in it is medical advice. If something is worrying you, talk to your doctor.

### FAQ

**What is Digest?**
Digest is a food and symptom journal for iPhone and iPad. You log meals and how you feel, and it compares each food against your own meals without it. The result is a ranked list of suspect foods and a list of what looks fine so far, each with the meals behind it.

**How long until Digest finds a suspect?**
About 3 weeks of regular logging, sometimes 4. A food needs at least 5 meals, with symptoms after meals at least a week apart, before Digest names it. In the first week most foods sit at watching, and each card says how many meals it's short of.

**Do I have to count calories or look foods up in a database?**
No. You type a meal in plain words, such as "two eggs and toast around 8", and Digest reads it into foods and a time. There are no calories, no portions to weigh and no food database. A meal takes about 10 seconds to log.

**How does Digest decide that a food is a suspect?**
It looks back from each symptom over a window that suits it (3 hours for reflux, 6 for bloating, 2 days for a stool change) and notes what you ate. A food becomes a suspect when the symptom follows meals with it about half again as often as meals without it, on enough meals that luck stops explaining it.

**Can Digest tell me whether I have IBS or a food intolerance?**
No. Digest doesn't diagnose anything and it isn't a medical device. It shows patterns in what you logged and lists foods worth testing. If you have IBS, reflux or a suspected intolerance, Digest works as your food and symptom diary; what a pattern means medically is a question for your doctor.

**Does Digest work with a low-FODMAP or elimination diet?**
Digest has no FODMAP database and no diet plan. It works from what you log. You can tag foods with what they contain, and you can test one suspect at a time: avoid it for 1 to 3 weeks, put it back on 3 days and compare the two stretches.

**Where is my data stored?**
On your device. There's no Digest account and no server of ours. If iCloud is on, your journal syncs through your own iCloud account. The analysis runs on the device, the app has no analytics, and you can export everything as CSV or JSON.

**What does Digest cost?**
Logging is free forever, including history, iCloud sync and export. Insights (suspects, evidence, what looks fine so far, guided tests, the weekly letter and the report) cost $6.99 a month, $39.99 a year or $89.99 once in the US.

**Which devices does Digest run on?**
iPhone and iPad, on iOS 26 or later.

### Closing

**Headline:** 10 seconds a meal

**Body:** Three weeks of this is the cheap way to find out.

**CTA:** Download on the App Store
**CTA subtext:** Logging is free, forever.

### Footer microcopy

Digest is an observational journal, not a medical device. It does not diagnose or treat anything.

Privacy · Support · Made by Roland Leth · Last updated [date]

## Appendix B: Reckon, the short case

**Summary:** A decision journal for iPhone and iPad: write what you predict and how sure you are, mark what happened, see your calibration. One-time, no account. After a few dozen calls it shows whether the ones you made at 70% come in about 70% of the time. Syncs over iCloud, no subscription.

**Platform and role:** iOS, iPad. Sole developer.

**Link:** App Store. **Offer:** One-time purchase, $3.99.

### How it works (4 images)

You log the call while it's still uncertain: the prediction, a line of reasoning, and one number for how sure you are.

A 30-second check-in nudges that confidence up or down as things change, and every one of them stays on the record.

When it's over you mark what actually happened and how satisfied you are with the call, your original prediction sitting right there so hindsight can't quietly rewrite it.

Do that a few dozen times and the reliability diagram has enough to work with. It plots what you said against what happened, so you can see where you run over-confident and where you run under.

Captions: "Log the call while it's still uncertain." "Check in as it ages." "Call it, honestly." "Confidence against hit rate."

### Keeping the receipt (1 image)

Every past call feels obvious in hindsight, the wins stay and the misses quietly drop out, and judgment never improves because nothing was ever scored.

Reckon stores what you predicted, how sure you were, and what actually happened. You said 60, it came in at 78, and that stays on the record whatever you remember later. Enough of those and you know which way you lean, and by how much, before the next call that matters.

Caption: "Hindsight rewrites how sure you were."

### Why it exists (1 image)

Philip Tetlock's Superforecasting, and the Good Judgment Project behind it, keep coming back to the same finding: your judgment sharpens when you write predictions down and score them honestly.

Reckon is that discipline without the busywork: you write the prediction before the outcome is known, and put a real number on how sure you are.

I've been shipping products for 15 years, making calls under uncertainty the whole time, and I kept score of almost none of them. I built Reckon to find out whether my judgment was any good.

Caption: "Built on a boring, well-tested idea."

### FAQ questions

What is Reckon? How is it different from a notes app? What is calibration, and why track it? Is my data private? Does it need an account? How much does Reckon cost? How many decisions before the calibration means anything? Is there a Mac version?

### Guides

One hub: "Making better decisions", 10 guides.

## Appendix C: Continuum, in outline

**Summary:** A private Mac app for managers: a note after each 1:1, and a read of every direct report that moves on the record over months. Free for up to 3 people. Nothing leaves your Mac: no cloud, no account, nothing reported upward, and it never scores anyone.

**Platform and role:** macOS. Sole developer. **Link:** Mac App Store.

**Sections and captions:**

- How it works (4 images): "2 minutes, right after the 1:1." "Tag what it says about them." "The read updates, in words." "Open Focus. Know where to look."
- The payoff (1 image): "Replace recall with a record."
- Private, no scores (1 image): "Notes about people never leave your Mac."

**Offers:** Free (up to 3 people), $0. Monthly, $12. Yearly, $108. Lifetime, $249.

**FAQ questions:** What is Continuum? Where is my data stored? Is it private? How is it different from a 1:1 meeting tool? Who is Continuum for? Does it score or rank people? How much does Continuum cost? Does it sync between Macs?
