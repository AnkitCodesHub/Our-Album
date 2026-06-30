# Our Album

A minimal, modern photo timeline — built with React, no build step required.
Open `index.html` in a browser to preview it, or host it free on GitHub Pages.

## What's in here

```
index.html          ← the page itself, loads everything else
style.css            ← all the visual design
app.jsx              ← the React app (timeline, lightbox, etc.)
config.js            ← ✏️ edit this: your names, start date, messages
data.js              ← ✏️ the list of your photos (auto-generated, see below)
generate-manifest.js ← run this with Node to build data.js from /photos
photos/               ← put your image files in here
```

## 1. Personalize it

Open `config.js` and fill in your names, the date your story started, and
the short messages at the top and bottom of the page. That's the only file
you *have* to edit by hand.

## 2. Add your ~200 photos

1. Copy all your image files (`.jpg`, `.png`, `.webp`, `.heic`, etc.) into
   the `photos` folder.
2. **Compress them first if you can.** 200 full-resolution phone photos can
   easily be several GB, which makes the page slow to load and the GitHub
   repo unwieldy. Resizing to ~1600px on the long edge and exporting at
   ~80% quality (e.g. with [Squoosh](https://squoosh.app), or a batch tool
   like XnConvert / ImageMagick) usually keeps photos looking sharp at a
   fraction of the size.
3. **If your photos are `.HEIC` (default on iPhone), convert them to
   `.jpg` first.** HEIC doesn't display in most browsers besides Safari —
   tools like Squoosh, XnConvert, or your Photos app's export/share
   options can batch-convert them.
4. From a terminal, inside this project folder, run:
   ```
   node generate-manifest.js
   ```
   This scans `/photos` and writes `data.js` for you automatically, sorted
   by each file's date.
   *(Don't have Node? Install it free from [nodejs.org](https://nodejs.org),
   or just edit `data.js` by hand — the format is explained in comments
   at the top of that file.)*
5. Open `data.js`. Every photo got a default date from its file's
   last-modified timestamp — fix any that are wrong. Add a short
   `caption` to any photo you want featured as a bigger "moment" in the
   story; leave `caption: ""` on the rest and they'll show up as small
   everyday snapshots grouped by month.
6. Re-run `node generate-manifest.js` any time you add more photos later —
   it won't overwrite captions you've already written.

## 3. Preview it

Just open `index.html` in your browser (double-click it, or drag it into
a browser window). No server or build step needed.

## 4. Put it on GitHub Pages

1. Create a new repository on GitHub (it can be public or private — Pages
   works either way, though private repos need a paid plan for Pages).
2. Push everything in this folder to that repository:
   ```
   git init
   git add .
   git commit -m "our album"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
3. On GitHub, go to the repo's **Settings → Pages**.
4. Under "Build and deployment," set **Source** to "Deploy from a branch,"
   pick the **main** branch and the **/ (root)** folder, then **Save**.
5. After a minute or two, GitHub will show you the live URL — something
   like `https://YOUR-USERNAME.github.io/YOUR-REPO/`. That's the link to
   send her.

## Notes

- The page is fully responsive — it'll look right on her phone.
- Photos without a caption are grouped into small click-to-enlarge grids
  by month; photos with a caption get a full featured layout with a "day
  ___" counter at the top that keeps ticking up.
- Everything runs client-side — there's no backend, no database, and
  nothing to pay for.
