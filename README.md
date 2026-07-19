# 蛙の葉書 — Kaeru Portfolio

Helena's portfolio site, implemented in Next.js from the Claude Design prototype
(`Kaeru Portfolio.dc.html`), plus a hidden `/admin` page backed by Firebase.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The site works without Firebase — it shows the ten
built-in default projects until Firestore has data.

## Firebase setup (for /admin and live project data)

1. Create a project at https://console.firebase.google.com
2. Build → **Firestore Database** → Create database (production mode is fine).
3. Project settings → Your apps → **Add a Web app** → copy the config values.
4. `cp .env.local.example .env.local` and paste the values in.
5. In Firestore → Rules, paste the contents of [`firestore.rules`](firestore.rules)
   and publish.
6. Restart `npm run dev`.

### The /admin page

- It is **not linked from anywhere** — go to http://localhost:3000/admin directly.
- On first visit it asks you to **create the admin password**. The SHA-256 hash is
  stored in Firestore at `settings/admin` (never the plain password), and the rules
  in `firestore.rules` only allow that document to be created once — to change the
  password later, delete the `settings/admin` document in the Firebase console and
  set a new one.
- Once signed in you can add / edit / reorder / delete projects (stored in the
  `projects` collection) and read notes submitted through the contact form
  (`messages` collection). "Import the 10 default projects" seeds Firestore with
  the design's original cards.
- Each project can have **up to 12 photos**, uploaded right in the admin (drag
  in files or paste image URLs) with automatic client-side compression. Photos
  are stored one-per-document in a `projects/{id}/photos` subcollection rather
  than inline on the project — Firestore caps a single document at 1 MiB, so
  this gives every photo its own budget (up to ~850 KB, good quality) instead
  of 12 photos splitting one shrinking pool.

### Security caveat — please read

The password gate runs entirely in the browser, which is what keeps this setup
simple (no server, no Firebase Auth). It hides the admin UI, but anyone who reads
the site's JavaScript could technically write to the `projects` collection
directly because the Firestore rules allow public writes. For a personal
portfolio this is usually acceptable; if you want real protection later, switch
to Firebase Authentication (e.g. email+password for just your account) and change
the `projects` rule to `allow write: if request.auth != null;`.

## The Tears display font

The design uses the licensed **tearsfont** (justfont) for big headings. The font
file couldn't be exported from the design project, so headings currently fall
back to *Shippori Mincho* (already loaded). If you own the font, drop the file at:

```
public/fonts/tearsfont-1.0.otf
```

and the headings will pick it up automatically — the `@font-face` rule is already
in `app/globals.css`.

## Where things live

| Path | What |
| --- | --- |
| `components/HomePage.tsx` | The whole portfolio page (hero, work, about, contact, footer) |
| `components/Frog.tsx` | The draggable frog mascot — hops, speaks 3 languages, easter eggs |
| `lib/i18n.ts` | EN / 中文 / 日本語 copy + frog dialogue |
| `lib/projects.ts` | Project type, defaults, Firestore fetch |
| `lib/firebase.ts` | Firebase init (safe when unconfigured) + SHA-256 helper |
| `app/admin/page.tsx` | Hidden admin: password gate, project CRUD, contact notes |
| `firestore.rules` | Suggested Firestore security rules |
