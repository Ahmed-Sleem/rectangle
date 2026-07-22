# Tornix — Links, Access & Technical Notes

## Primary URLs

| Purpose | URL | Status (2026-07-22) |
|---------|-----|---------------------|
| Marketing homepage | https://tornix.ai/ | 200 |
| www alias | https://www.tornix.ai/ | Serves same brand (privacy path 404) |
| Web app login | https://app.tornix.ai/login | 200 |
| Web app register | https://app.tornix.ai/register | 200 |
| Web app signup | https://app.tornix.ai/signup | 200 |
| iOS App Store (SA) | https://apps.apple.com/sa/app/tornix-pmo/id6760791222 | 200 |
| Google Play | https://play.google.com/store/apps/details?id=ai.tornix.mobile | 200 |
| Ailigent home | https://ailigent.ai/ | 200 |
| Ailigent Tornix case | https://ailigent.ai/work/tornix/ | 200 |
| Privacy (referenced by iOS) | https://www.tornix.ai/privacy-policy | **404** |
| Privacy (Android listing) | https://aboelmakarem.pro/privacy | 200 |
| robots.txt | https://tornix.ai/robots.txt | Allow: / ; Sitemap declared |
| sitemap.xml | https://tornix.ai/sitemap.xml | Only `https://tornix.ai` (lastmod 2026-06-13) |

## CTA buttons on marketing site

- ابدأ رحلتك الآن / Start → https://app.tornix.ai/login  
- App Store badge → iOS link above  
- Google Play badge → Play link above  
- جرّبه الآن (AI section) → app login  
- Contact form → on-page (name, email, message)  

## Open Graph / SEO meta (homepage)

```
title: Tornix - تورنكس | AI-Powered Construction Management
description: Your Workflow Is Slowing You Down. Tornix Fixes That. Ten years of productivity for your upcoming projects.
og:locale: ar_AR
og:locale:alternate: en_US
og:site_name: Tornix - تورنكس
og:url: https://tornix.ai
og:image: https://tornix.ai/opengraph-image?... (1200×630 PNG)
twitter:card: summary_large_image
application-name: Tornix
```

## Web app meta (app.tornix.ai)

```
title: Tornix
description: Tornix is a project management tool that helps you manage your projects.
author: Tornix
```

Served behind **Caddy**; headers observed: `strict-transport-security`, `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `access-control-allow-origin: *`, `referrer-policy: strict-origin-when-cross-origin`.

## Marketing site tech snapshot

- Framework: **Next.js** (App Router / Flight, Turbopack chunk names)  
- Fonts: **Cairo** (AR) + **Commissioner** (EN) via Google Fonts  
- PWA manifest: name/short_name `Tornix`, `display: standalone`, theme/background `#ffffff`  
- Icons: favicon.svg/ico, apple-touch-icon, maskable 192 & 512  
- Default content language orientation: Arabic-first  
- No public `/pricing`, `/about`, `/blog`, `/docs`, `/terms` routes (all 404)  
- Single-page marketing surface (content hydrated client-side from JS chunks)  

## Notable asset paths (marketing)

```
/images/logo-icon.svg
/images/logo-text.svg
/images/hero-crystal-left.png
/images/hero-crystal-right.png
/images/iphone-mobile.png
/images/modules-globe.png
/images/marketing-construction.mp4
/images/ai-robot-avatar.png
/images/compare-tornix-logo.png
/images/ailigent-logo.png
/opengraph-image
/twitter-image
/site.webmanifest
```

## Ailigent product tour deep links (screenshots labeled)

```
app.tornix.ai/dashboard
app.tornix.ai/strategy
app.tornix.ai/tasks
app.tornix.ai/assistant
app.tornix.ai/flows
app.tornix.ai/timeline
app.tornix.ai/portfolio
app.tornix.ai/approvals
```

## Package / store identifiers

```
iOS bundle listing name: Tornix PMO
iOS app id: 6760791222
Android applicationId: ai.tornix.mobile
```

## Support & social crumbs

| Item | Value |
|------|--------|
| Android support email | info@ailigent.ai |
| Co-founder X | https://twitter.com/karem_shohud |
| Co-founder GitHub | https://github.com/karem505 |
| CEO LinkedIn | https://www.linkedin.com/in/alsenosy/ |
| Co-founder LinkedIn | https://www.linkedin.com/in/abo-el-makarem-shohoud-745367244/ |

## Pages that do NOT exist publicly (checked)

`/privacy` `/privacy-policy` `/terms` `/terms-of-service` `/about` `/pricing` `/contact` `/en` `/ar` `/blog` `/docs` `/faq` — all **404** on tornix.ai (contact is homepage section only).
