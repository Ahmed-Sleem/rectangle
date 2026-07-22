# Tornix — Source Notes, Gaps & Bilingual Quote Bank

## Collection metadata

| Field | Value |
|-------|--------|
| Collected on | 2026-07-22 |
| Primary URL | https://tornix.ai/ |
| Methods | Page fetch (markdown extraction), HTML/meta parse, Next.js chunk string extraction, App Store + Play Store pages, Ailigent site + Tornix case page, web search for company signals |
| Not done | Authenticated app crawl (requires login), network/API reverse engineering, paid store purchase flows, emailing the company |

## Source reliability tiers

1. **Primary:** tornix.ai visible marketing copy + meta tags + comparison table  
2. **Primary product:** App Store / Play Store long descriptions & changelogs  
3. **Ecosystem:** ailigent.ai + ailigent.ai/work/tornix/  
4. **Secondary people/GTM:** LinkedIn public snippets, aboelmakarem.pro meta  
5. **Inferential:** Demo UI sample projects (illustrative), self-scored competitor matrix  

## Known gaps / inconsistencies

1. **No public pricing** on tornix.ai.  
2. **Privacy policy** linked from iOS is **404** on tornix.ai; Android points to co-founder personal domain.  
3. **No terms of service** page found.  
4. **Sitemap** only lists homepage — no blog/docs structure.  
5. **Developer entities differ** across iOS (Ahmed Ibrahim) vs Android (Ailigent AI / Karem) vs brand (Tornix) vs partner (Ailigent).  
6. **Testimonial names** look generic/Western for a MENA construction product — verify before citing as social proof.  
7. **Play Data Safety** says “no data collected” while iOS lists substantial linked data — declarations conflict; do not assume either is complete.  
8. Marketing site is **client-rendered**; simple HTML scrapes miss body copy unless JS chunks or a browser renderer are used.  
9. Ailigent impact counters did not resolve to final numbers in text extraction.  
10. English and Arabic strings both ship in the same JS bundles (bilingual product).

## Useful bilingual quote bank

### Hero
- EN: Your Workflow Is Slowing You Down. Tornix Fixes That.  
- EN: Ten years of productivity for your upcoming projects.  
- AR: عشر سنوات من الإنتاجية لمشاريعك القادمة.  
- AR: سير عملك يبطئك — تورنكس يحل ذلك.

### Mobile
- EN: Your project in your pocket, wherever the site takes you.  
- EN: The manager on the road. The engineer on the floor. The investor in the meeting. Tornix keeps everyone in the loop — no laptop needed.  
- AR: مشروعك في جيبك، أينما أخذك الموقع.  
- AR: المدير في الطريق. المهندس في الموقع. المستثمر في الاجتماع. تورنكس يبقي الجميع على اطلاع — بدون لابتوب.

### Platform
- EN: Everything you need in one covered AI platform.  
- EN: More than 17 integrated modules for full control over your projects — from planning and execution to costs, risks, and strategy. Everything in one place, powered by AI, in Arabic and English.  
- AR: كل ما تحتاجه في منصة ذكاء اصطناعي واحدة متكاملة.  
- AR: أكثر من 17 قسماً متكاملاً…

### AI
- EN: AI isn't a feature in Tornix. It's the foundation.  
- EN: Not a tool. A teammate that outthinks every problem.  
- EN: While you sleep, your agents schedule, alert, report, and decide.  
- EN: The risk your team missed? Tornix caught it 3 weeks ago.  
- AR: الذكاء الاصطناعي ليس ميزة في تورنكس. إنه الأساس.  
- AR: ليس أداة. زميل فريق يتفوق على كل مشكلة.  
- AR: بينما تنام، وكلاؤك يجدولون وينبهون ويقدمون التقارير ويقررون.  
- AR: الخطر الذي فاته فريقك؟ تورنكس اكتشفه قبل 3 أسابيع.

### Closing CTA
- EN: Stop managing construction. Start leading it.  
- EN: Whether you're managing one site or a full portfolio — Tornix fits.  
- AR: توقف عن إدارة البناء. ابدأ بقيادته.  
- AR: سواء كنت تدير موقعاً واحداً أو محفظة كاملة — تورنكس يناسبك.

### Comparison framing
- EN: Built for MENA contractors. Powered by AI. In Arabic and English.  
- EN: Why settle for yesterday's tools while you can build with Tornix?  
- AR: مصمم لمقاولي الشرق الأوسط. مدعوم بالذكاء الاصطناعي. بالعربية والإنجليزية.

### Partner
- EN: We partnered with Ailigent to deliver a smarter AI-driven experience.  
- AR: تعاونّا مع Ailigent لتقديم تجربة ذكية تعتمد على الذكاء الاصطناعي.

### Footer
- © 2026 Tornix. All rights reserved.  
- سياسة الخصوصية · إعدادات ملفات تعريف الارتباط (labels present; privacy URL broken)

## Module one-liners (AR source → intent)

| Module | AR one-liner (abridged) |
|--------|-------------------------|
| Dashboard | مشروعك بنظرة واحدة، قبل قهوتك الأولى… فقط وضوح. |
| Projects | مكان واحد لإدارة كل مشروع… الذكاء الاصطناعي يبني الهيكل من جدول الكميات. |
| Tasks | تتبع كل مهمة… كانبان أو قائمة… لن يضيع أي عمل. |
| Calendar | يربط المواعيد والمعالم والاجتماعات والفحوصات… |
| Library | معرفة مؤسستك في البناء، قابلة للبحث وإعادة الاستخدام… |
| Documents | الرسم الصحيح. النسخة المعتمدة. تجدها في 5 ثوانٍ… |
| Chats | توقف عن فقدان القرارات في مجموعات واتساب… AI يلخص المحادثات. |
| Risks | لا تنتظر حتى تصبح المخاطر كوارث… مصفوفة 5×5. |
| Requests | دورة موافقات ذكية من التقديم إلى الاعتماد النهائي. |
| Team | اعرف من هو مثقل قبل أن يخطئ. |
| Strategy | بطاقة الأداء المتوازن، KPI حية، أربعة مناظير. |
| Mail | اربط الرسائل بالمشاريع والمهام تلقائياً. |
| PMO | محفظة كاملة: ميزانيات، مخاطر، توافق استراتيجي، صحة البرامج. |

## Refresh checklist (for future updates)

- [ ] Re-fetch https://tornix.ai/ and app stores  
- [ ] Check if `/privacy-policy` and `/pricing` went live  
- [ ] Diff iOS/Android version + changelogs  
- [ ] Re-read ailigent.ai/work/tornix/ for new metrics  
- [ ] Search LinkedIn “Tornix” / “تورنكس” for GTM changes  
- [ ] Update `data/*.json` and this pack’s collection date  

