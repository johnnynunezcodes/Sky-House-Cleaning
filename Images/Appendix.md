# Images

Reference for where visual assets live in this project.

## Logos
Located in `Logos/`:
- [Full logo transparent](Logos/Full%20logo%20transparent.png) — full logo (icon + wordmark), transparent background.
- [Logo Icon (PNG)](Logos/Logo%20Icon.png) — icon-only mark, transparent background, source raster.
- [Logo Icon (SVG)](Logos/Logo%20Icon.svg) — vector version of the icon, traced from the PNG above.
- [Logo icon white background](Logos/Logo%20icon%20white%20background.png) — icon-only mark on a white background.
- [Logo with white background](Logos/Logo%20w%3Awhite%20background.png) — full logo on a white background. Copied into the website project as `Website/public/images/logo-full-white-bg.png` (colon dropped — unsafe in a URL/filename) and used as the `og:image` link-preview image in `Layout.astro`. If this source file changes, re-copy it there by hand.

## Job Photos (Unsorted)
`Job Photos - Unsorted/` holds raw before/after job photos (HEIC/JPEG straight off the phone) waiting to be sorted through. Git-ignored — never pushed to GitHub. When you pick shots to actually use on the site, convert them to a web format (JPG/WebP), optimize/resize, give them a descriptive filename, and copy just those into `Website/public/images/` by hand — the same pattern already used for the logo assets above.

- `Job Photos - Unsorted/Cleaners/` holds staff photos (currently one: a team member in uniform, on the job). The first pick from here (`IMG_2053.heic`) was converted/resized to `Website/public/images/about/bay-area-house-cleaner-sky-house-cleaning.jpg` (keyword-bearing filename, not just a generic name — helps Google Images pick it up for "Bay Area house cleaner"-type searches), used on the About page's intro section (`about.astro`) as the site's first real photo of the team — everything there was plain text before. Its alt text and embedded EXIF (ImageDescription/Artist/XPTitle/XPKeywords, written via Pillow) were also set to the same SEO-friendly title/description/keywords rather than left blank.

When you add new images (or markdown files) to this project, add a link or folder note here so I know where to find them.
