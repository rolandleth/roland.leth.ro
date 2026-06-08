import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import type { Prisma } from "../src/generated/prisma/client"

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const posts: Prisma.PostCreateInput[] = [
	{
		title: "Building a personal website with Next.js 15",
		body: `# Building a personal website with Next.js 15

After years of procrastinating, I finally rebuilt my personal site from scratch using Next.js 15
and the App Router. Here's what I learned along the way.

## Why Next.js 15?

The App Router fundamentally changes how you think about data fetching. Server components
are the default, which means you write less client-side JavaScript and get better performance
out of the box.

\`\`\`tsx
// Server component — no useEffect, no loading state
export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug)
  return <article>{post.body}</article>
}
\`\`\`

## Tailwind CSS v4

The new engine is significantly faster and the configuration is now CSS-first, which
feels more natural. No more \`tailwind.config.js\` for basic setups.

## Lessons learned

- Start with mobile layout first — it's easier to expand than to shrink
- Keep components small and focused
- Avoid \`"use client"\` unless you genuinely need interactivity`,
		summary:
			"Rebuilding a personal website from scratch using Next.js 15 App Router, Tailwind CSS v4, and PostgreSQL.",
		imageUrl: "https://picsum.photos/seed/nextjs/1200/630",
		section: "tech",
		slug: "building-personal-website-nextjs-15",
		datetime: "2026-01-15-0900",
		readingTime: "5 min read",
		published: true,
	},
	{
		title: "Understanding TypeScript's type system",
		body: `# Understanding TypeScript's type system

TypeScript's type system is one of the most expressive in mainstream languages. Let's
look at some patterns that are surprisingly powerful.

## Discriminated unions

\`\`\`ts
type Result<T> =
  | { status: "success"; data: T }
  | { status: "error"; message: string }

function handle<T>(result: Result<T>) {
  if (result.status === "success") {
    console.log(result.data) // T
  } else {
    console.log(result.message) // string
  }
}
\`\`\`

## Template literal types

\`\`\`ts
type EventName = "click" | "focus" | "blur"
type Handler = \`on\${Capitalize<EventName>}\` // "onClick" | "onFocus" | "onBlur"
\`\`\`

## Mapped types

\`\`\`ts
type Readonly<T> = {
  readonly [K in keyof T]: T[K]
}
\`\`\`

These three patterns cover the vast majority of real-world type challenges.`,
		summary:
			"A practical look at discriminated unions, template literal types, and mapped types in TypeScript.",
		imageUrl: "https://picsum.photos/seed/typescript/1200/630",
		section: "tech",
		slug: "understanding-typescript-type-system",
		datetime: "2026-01-28-1000",
		readingTime: "7 min read",
		published: true,
	},
	{
		title: "PostgreSQL full-text search with Prisma",
		body: `# PostgreSQL full-text search with Prisma

Adding search to a blog feels like it should be simple, but the details matter.
Here's how I implemented full-text search without adding a dedicated search service.

## tsvector and tsquery

PostgreSQL's built-in full-text search is powered by two types:

- \`tsvector\`: a preprocessed document (stemmed, stopwords removed)
- \`tsquery\`: a search query, also preprocessed

\`\`\`sql
SELECT title FROM posts
WHERE to_tsvector('english', title || ' ' || body) @@ plainto_tsquery('english', 'next.js performance')
ORDER BY ts_rank(to_tsvector('english', body), plainto_tsquery('english', 'next.js performance')) DESC;
\`\`\`

## Adding a generated column

For performance, generate and index the vector at write time:

\`\`\`sql
ALTER TABLE posts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) STORED;

CREATE INDEX posts_search_idx ON posts USING GIN (search_vector);
\`\`\`

## Calling it from Prisma

Prisma doesn't model tsvector natively, so use \`$queryRaw\`:

\`\`\`ts
const results = await prisma.$queryRaw\`
  SELECT id, title, slug, section
  FROM posts
  WHERE search_vector @@ plainto_tsquery('english', \${query})
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', \${query})) DESC
  LIMIT 10
\`\`\``,
		summary:
			"Implementing full-text search in PostgreSQL using tsvector/tsquery and calling it through Prisma with $queryRaw.",
		imageUrl: "https://picsum.photos/seed/postgres/1200/630",
		section: "tech",
		slug: "postgresql-full-text-search-prisma",
		datetime: "2026-02-10-0830",
		readingTime: "6 min read",
		published: true,
	},
	{
		title: "Why I stopped using global state",
		body: `# Why I stopped using global state

For a long time, my default answer to "where does this data live?" was a global store.
Redux, Zustand, Jotai — I've used them all. I don't reach for them anymore.

## The problem with global state

Global state creates invisible dependencies. Any component can read or write to it,
which makes it hard to reason about what caused a re-render or why a value is stale.

## What I do instead

**Server state**: React Query or SWR. These handle caching, revalidation, and loading
states better than any hand-rolled store.

**Form state**: React Hook Form. Local by default, with excellent performance because
it avoids unnecessary re-renders.

**UI state**: \`useState\` or \`useReducer\` in the component that owns it. If it needs to
be shared, lift it up — but only as far as necessary.

**URL state**: For filters, pagination, and search terms. Shareable, bookmarkable,
survives a refresh.

Global state is still the right tool for a few things: auth session, theme, locale.
But that's about it.`,
		summary:
			"How server state, form state, URL state, and local component state replace the need for a global store in most applications.",
		imageUrl: null,
		section: "tech",
		slug: "why-i-stopped-using-global-state",
		datetime: "2026-02-24-1100",
		readingTime: "4 min read",
		published: true,
	},
	{
		title: "CSS animations without a library",
		body: `# CSS animations without a library

Framer Motion is great, but shipping 50kB of JavaScript for a fade-in is overkill.
Modern CSS can handle most UI animations natively.

## view-transition API

\`\`\`css
@view-transition {
  navigation: auto;
}
\`\`\`

One line and you get animated page transitions in browsers that support it,
graceful degradation everywhere else.

## @starting-style

New in 2024, this lets you animate elements as they enter the DOM:

\`\`\`css
.dialog {
  opacity: 1;
  transition: opacity 0.3s;

  @starting-style {
    opacity: 0;
  }
}
\`\`\`

## When to still use a library

- Complex gesture-driven animations (drag, spring physics)
- Orchestrated sequences across multiple elements
- Exit animations (CSS still struggles with these)

For everything else, the platform is usually enough.`,
		summary:
			"Using view-transition API, @starting-style, and other modern CSS features to animate UIs without JavaScript.",
		imageUrl: "https://picsum.photos/seed/css/1200/630",
		section: "tech",
		slug: "css-animations-without-a-library",
		datetime: "2026-03-05-0900",
		readingTime: "5 min read",
		published: true,
	},
	{
		title: "The tools I actually use every day",
		body: `# The tools I actually use every day

Everyone has their stack. Here's mine, with the honest reason I use each one.

## Terminal: Ghostty

Fast, native, and the config format is actually readable. I was on iTerm2 for years
but the startup time difference is noticeable.

## Editor: VS Code + Vim mode

I tried full Neovim for three months. I missed the extension ecosystem too much.
VS Code with the Vim plugin gets me 90% of the way there.

## Git UI: Fork

Command line for most things, but Fork for visualising history and resolving
merge conflicts. The conflict editor alone is worth it.

## Notes: Plain markdown files

I've tried Notion, Obsidian, Bear. I always come back to a folder of \`.md\` files
synced with iCloud. Zero vendor lock-in, works with any editor.

## Database: TablePlus

Clean UI, fast, supports every database I work with. The tab-based workflow
is underrated.`,
		summary:
			"An honest look at the development tools I reach for every day: terminal, editor, git UI, notes, and database client.",
		imageUrl: null,
		section: "tech",
		slug: "tools-i-actually-use-every-day",
		datetime: "2026-03-18-0800",
		readingTime: "3 min read",
		published: true,
	},
	{
		title: "On reading more books",
		body: `# On reading more books

I used to read a lot. Then I got a smartphone. The correlation is not a coincidence.

## What changed

I used to read on the bus, waiting in line, in the ten minutes before bed.
Now those slots are filled with Twitter, then X, then Mastodon, then back to X.
The content is mostly worse. I'm mostly less happy.

## What I tried

**Kindle instead of phone**: Works until I check "just one notification."

**Scheduled reading time**: 30 minutes after dinner. The most reliable intervention
by far. The key was treating it like a meeting — a fixed slot, not a "when I feel like it."

**Audiobooks for commuting**: Not my preference for most books, but perfect for
narrative non-fiction.

## What I'm reading now

Currently halfway through *The Pragmatic Programmer* for the third time. It holds up.

The goal isn't to read more. The goal is to spend less time feeling vaguely
dissatisfied after scrolling, and more time feeling like I actually did something.`,
		summary:
			"Trying to read more books in a world designed to make that as difficult as possible.",
		imageUrl: null,
		section: "life",
		slug: "on-reading-more-books",
		datetime: "2026-01-20-0700",
		readingTime: "3 min read",
		published: true,
	},
	{
		title: "Moving to a new city at 30",
		body: `# Moving to a new city at 30

I moved to a new city last year, knowing almost nobody there. Here's what I
wish someone had told me.

## Making friends as an adult is genuinely hard

This isn't a personal failing — it's structural. You lose the mechanisms that made
it easy: school, dormitories, shared spaces with repeated low-stakes contact.

The replacement is intentionality, which is exhausting to sustain.

## What worked

**Saying yes to things for longer than felt natural.** The first three months of
any group or activity are awkward. Most people quit before it becomes comfortable.

**Finding activity-based social contexts.** Running clubs, climbing gyms, board
game nights. The activity gives you something to talk about that isn't small talk.

**Being the person who suggests doing things again.** Someone has to be the connector.
Most people are waiting for someone else to do it.

## What didn't work

Trying to accelerate things. Friendship has a pace and you can't push it.

A year in, I have a handful of people I'd call real friends. That used to feel
like a failure. Now it seems about right.`,
		summary:
			"Lessons from moving to a new city in my thirties: what it takes to build a social life from scratch.",
		imageUrl: "https://picsum.photos/seed/city/1200/630",
		section: "life",
		slug: "moving-to-a-new-city-at-30",
		datetime: "2026-02-03-0800",
		readingTime: "4 min read",
		published: true,
	},
	{
		title: "What I learned from a month without social media",
		body: `# What I learned from a month without social media

I deleted the apps in January. Not a digital detox, not a break — just stopped.
Here's what actually happened.

## The first week

Harder than expected. I kept reaching for my phone with no clear goal and then
putting it down again. The phantom limb feeling is real.

## The second week

I started noticing how much mental background noise disappeared. No half-formed
takes rattling around. No low-level anxiety about what was happening online.

## By the end

I got more done. I read more. I was less irritable in the evenings.

What I didn't expect: I missed almost nothing specific. I thought I'd miss the
news, the conversations, the sense of connection. The news was fine through RSS.
The conversations mostly weren't conversations.

## Would I go back?

Partially. A private account for family photos is fine. The algorithmic feed —
the thing optimised to keep you scrolling — that's what I'm not going back to.

The value was never the content. It was the habit of checking.`,
		summary:
			"What a month without social media actually felt like, and what I'm taking forward from it.",
		imageUrl: null,
		section: "life",
		slug: "month-without-social-media",
		datetime: "2026-02-14-0900",
		readingTime: "4 min read",
		published: true,
	},
	{
		title: "Cooking more at home",
		body: `# Cooking more at home

I've been cooking nearly every meal at home for the past year. Some observations.

## The learning curve is shorter than it looks

Three techniques cover most of what you'll ever cook: sautéing, roasting,
and braising. Learn those well and you can make almost anything edible.

## Mise en place is not a restaurant affectation

Having everything prepped before you start cooking removes the chaos that makes
weeknight cooking feel stressful. Ten minutes of prep means thirty minutes of calm.

## The cost argument is overstated

Home cooking is cheaper, but not as much as people claim once you account for
the ingredients you waste, the equipment you buy, and the time you spend.
The real argument for it is quality and control, not cost.

## What I've actually learned

- Salt goes in earlier than you think
- High heat for proteins, low heat for everything else
- Acid (lemon, vinegar) at the end makes most things taste better
- Fresh herbs are worth the money; dried herbs are fine in braises

I'm not a good cook. But I'm a much less bad one than I was a year ago.`,
		summary:
			"A year of cooking most meals at home: what I learned, what surprised me, and what I got wrong.",
		imageUrl: "https://picsum.photos/seed/cooking/1200/630",
		section: "life",
		slug: "cooking-more-at-home",
		datetime: "2026-03-01-0800",
		readingTime: "4 min read",
		published: true,
	},
	{
		title: "Building a side project you'll actually finish",
		body: `# Building a side project you'll actually finish

I have a graveyard of half-finished projects. Here's what I've learned about
which ones get done and which ones don't.

## The graveyard problem

Most side projects die not from technical problems but from motivation collapse.
You start excited, hit a boring middle section, and quietly stop.

## What predicts completion

**You'll use it yourself.** Dogfooding creates natural motivation to push through
the boring parts.

**It has a clear done state.** "A blog engine" is not a done state. "My personal
site, live on the internet, with ten posts" is.

**The fun-to-grind ratio is sustainable.** Every project has boring parts.
If the boring parts are too long, you'll quit. Design the project to have
more interesting problems, or be honest with yourself about your tolerance for grind.

## The permission you need

It's okay for a side project to just be for you. It doesn't have to be a startup,
a product, or a portfolio piece. The best side projects I've shipped were the ones
I built for myself with no audience in mind.`,
		summary:
			"Why most side projects die and what makes the ones that get finished different.",
		imageUrl: null,
		section: "life",
		slug: "building-side-project-youll-actually-finish",
		datetime: "2026-03-22-1000",
		readingTime: "4 min read",
		published: true,
	},
	{
		title: "Draft: Notes on debugging",
		body: `# Notes on debugging

Some rough notes on how I approach debugging that I keep coming back to.

## Reproduce it first

You can't fix what you can't reproduce. Before touching any code, make sure
you can reliably trigger the bug. If you can't reproduce it, you're guessing.

## Read the error message

Actually read it. The whole thing. Most developers skim error messages looking
for familiar words. The specific message usually tells you exactly what's wrong.

## Change one thing at a time

When you're deep in a debugging session, the temptation is to try multiple
changes at once. This always makes things worse. You lose track of what you changed,
you can't tell what helped, and you compound the problem.

## Form a hypothesis before touching code

What do you think is happening? If you can't state a falsifiable hypothesis,
you're not debugging — you're hoping. Write it down. Check if your fix validates
or invalidates it.

More to add here — this is a draft.`,
		summary: "Working notes on a systematic approach to debugging.",
		imageUrl: null,
		section: "tech",
		slug: "notes-on-debugging",
		datetime: "2026-03-29-1500",
		readingTime: "3 min read",
		published: false,
	},
]

async function main() {
	console.log("Seeding posts...")

	let inserted = 0
	let skipped = 0

	for (const post of posts) {
		try {
			await prisma.post.create({ data: post })
			inserted++
		} catch (error) {
			console.error(`  Skipped "${post.slug}": ${error}`)
			skipped++
		}
	}

	console.log(`Done: ${inserted} inserted, ${skipped} skipped.`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
