# 1DE1 Store — Project Overview

## Brand

**1DE1 Clothing** — limited edition streetwear, each piece numbered.

## Domains

| Purpose | URL |
|---|---|
| Main site / Shopify store | https://1de1.co |
| Shopify admin | https://1de1.myshopify.com |
| Store front-end (this repo) | Deployed via Vercel, pushed from GitHub |
| GitHub repo | https://github.com/Ngo-hub/1de1-store |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Front-end | Single-file `index.html` (HTML + CSS + vanilla JS) |
| Hosting | Vercel (static + serverless functions) |
| Serverless functions | `api/*.js` — Vercel Edge/Node handlers |
| E-commerce | Shopify (products, checkout, variant IDs) |
| AI try-on | Replicate — IDM-VTON model |
| Fonts | Google Fonts: Rajdhani, Cinzel, Share Tech Mono |

### Vercel Serverless Functions (`api/`)

| File | Method | Purpose |
|---|---|---|
| `api/tryon.js` | POST | Proxies request to Replicate, creates a prediction, returns `predictionId` immediately (avoids Vercel 10s timeout) |
| `api/poll.js` | GET `?id=` | Polls Replicate prediction status, returns `{ status }` or `{ status, imageUrl }` |
| `api/checkout.js` | POST | Calls Shopify Storefront API `cartCreate` mutation — currently unused (checkout uses client-side permalink instead) |

### Environment Variables (set in Vercel dashboard)

| Variable | Used by | Purpose |
|---|---|---|
| `REPLICATE_TOKEN` | `api/tryon.js`, `api/poll.js` | Replicate API bearer token |
| `SHOPIFY_STOREFRONT_TOKEN` | `api/checkout.js` | Shopify Storefront Access Token (unused in current flow) |

---

## Products — Uni 001 Drop

### Uni Zip (Outerwear)
- Edition: 1 of 50 — Price: $80
- Shopify URL: https://1de1.co/products/uni-zip
- Cutout image: `uni-zip-cut.png`

| Size | Variant ID |
|---|---|
| S | 51431795753184 |
| M | 51431795785952 |
| L | 51431795818720 |
| XL | 51431795851488 |
| 2XL | 51431795884256 |

### Uni Tee (Top)
- Edition: 1 of 75 — Price: $44
- Shopify URL: https://1de1.co/products/uni-tee
- Cutout image: `uni-tee-cut.png`

| Size | Variant ID |
|---|---|
| S | 51431795982560 |
| M | 51431796015328 |
| L | 51431796048096 |
| XL | 51431796080864 |
| 2XL | 51431796113632 |

### Uni Rugby (Polo)
- Edition: 1 of 60 — Price: $62
- Shopify URL: https://1de1.co/products/uni-rugby
- Cutout image: `uni-rugby-cut.png`

| Size | Variant ID |
|---|---|
| S | 51431796211936 |
| M | 51431796244704 |
| L | 51431796277472 |
| XL | 51431796310240 |

### Shopify Cart Permalink Format
```
https://1de1.co/cart/VARIANTID1:1,VARIANTID2:1,VARIANTID3:1
```

---

## Characters (Avatar Select)

Three playable characters on the character select screen, each with a photo and cutout PNG used for the AI try-on stage:

| ID | Name | Photo | Cutout |
|---|---|---|---|
| alpha | Alpha | `alpha.jpg.png` | `alpha-cut.png` |
| omega | Omega | `omega.jpg.png` | `omega-cut.png` |
| delta | Delta | `delta.jpg.png` | `delta-cut.png` |

---

## What Has Been Built

### UI / UX
- **Boot screen** — animated loading bar, "System initializing" copy, 1DE1 logo
- **Character select screen** — choose avatar (Alpha / Omega / Delta) before entering the store
- **Main store screen** — game-style HUD layout with:
  - Fixed black header with 1DE1 logo + LOADOUT button with item count badge
  - Left panel: character stage with equipped badge strip and "Wearing:" text
  - Center: three product cards (thumbnail, name, edition, price, size picker, dual buttons)
  - Right panel: AI try-on result with animated scanner loading UI
- **Light theme** — `#f5f5f5` background, white panels, `#111111` text, gold (`#c8a876`) accent

### Shopping Flow
- **ADD TO CART** button → size picker appears → picking a size silently adds item to loadout
- **LOADOUT drawer** (slides in from right) — shows all cart items with remove buttons
- **CHECKOUT** button — builds Shopify cart permalink with all variant IDs and opens in new tab

### AI Try-On Flow
- **ADD TO FIT** button → size picker appears (fit mode)
- Picking a size → item added to `fitted` Set (visual equip only, separate from purchase cart)
- Calls `/api/tryon` with character photo + product cutout → gets `predictionId`
- Polls `/api/poll?id=` every 3 seconds until `succeeded`
- Displays result image in the right panel with animated scanner UI during loading
- Changing character clears all fitted items and try-on result

### Checkout
- Cart permalink built client-side: `https://1de1.co/cart/VARIANTID:1,...`
- All variant IDs hardcoded in `index.html` — no runtime API fetch needed
- Console logs cart array, variant parts, and final URL for debugging

---

## What Still Needs to Be Done

- **Product photos** — product card thumbnails currently use cutout PNGs; proper lifestyle/product photography could replace or supplement these
- **Mobile layout** — the HUD layout is desktop-first; needs responsive breakpoints for mobile
- **More characters** — only three avatars; adding more would improve try-on diversity
- **IDM-VTON accuracy** — the Replicate model (version `c871bb9b...`) produces variable results; may want to try other virtual try-on models or tune parameters
- **Out-of-stock handling** — no sold-out state on product cards or size buttons
- **Analytics** — no tracking on add-to-cart, checkout clicks, or try-on usage
- **SEO / meta tags** — `index.html` has minimal meta tags; Open Graph / Twitter card tags missing
- **More drops** — only Uni 001 drop is live; architecture supports adding new drops/products

---

## AI Try-On — Replicate Model

- **Model:** IDM-VTON
- **Version:** `c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4`
- **Endpoint:** `POST https://api.replicate.com/v1/predictions`
- **Input fields:** `human_img`, `garm_img`, `garment_des`, `is_checked`, `is_checked_crop`, `denoise_steps`, `seed`
- **Pattern:** async create → poll (avoids Vercel's 10s function timeout)
