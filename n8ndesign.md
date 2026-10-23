# n8n Brand: n8ndesign.md

This file tells an AI agent how to generate on-brand n8n designs: social posts, campaign assets, event graphics, slides and layouts. It is organised in layers. Start at the top and work down.

1. Core Primitives: colour, type, spacing, radius
2. Core Brand Elements: logo and graphic devices
3. Graphic Modes (Semantic tokens): Light, Dark and Maker
4. The Grid: how everything is placed
5. Tone of Voice: how any copy on the design should read

---

## Rules that always apply

1. Use token names, not raw hex values, wherever the output supports tokens or variables.
2. Never generate, redraw or approximate the logo. Download it from the brand portal. See 2.1.
3. Never invent a colour, font, spacing or radius value that is not listed here. If something is missing, ask.
4. Every design is built in one Graphic Mode (Light, Dark or Maker). Pick the mode first, then take colours from that mode's tokens.
5. Every design sits on a cross grid built from multiples of 8px. See section 4.

---

## 1. Core Primitives

Raw values. In layouts, reach for the Graphic Modes (Semantic tokens) in section 3 first. Those point back to these primitives.

### 1.1 Colour

**Core**

| Token | Hex |
| --- | --- |
| `Color/Core/White` | `#FAFAFA` |
| `Color/Core/Black` | `#191919` |

**Accent: Pinks**

Our main pink is `#FF91AC`. It is the brand's signature colour. The tonal range supports it.

| Token | Hex | Notes |
| --- | --- | --- |
| `Color/Accent/Pink 10` | `#FFE8EC` | Lightest tint |
| `Color/Accent/Pink 20` | `#FFD0D9` | |
| `Color/Accent/Pink 30` | `#FFBCCA` | |
| `Color/Accent/Main Accent Pink` | `#FF91AC` | **Main brand pink** |
| `Color/Accent/Pink 70` | `#87003C` | Deep pink, pairs with white text |
| `Color/Accent/Pink 80` | `#5A0026` | Dark mode accent background |
| `Color/Accent/Pink 90` | `#44001B` | Darkest |

**Greys**

| Token | Hex |
| --- | --- |
| `Color/Gray/Gray 0` | `#FFFFFF` |
| `Color/Gray/Gray 05` | `#FAFAFA` |
| `Color/Gray/Gray 10` | `#F8F8F8` |
| `Color/Gray/Gray 15` | `#F1F1F1` |
| `Color/Gray/Gray 20` | `#EAEAEA` |
| `Color/Gray/Gray 25` | `#E0E0E0` |
| `Color/Gray/Gray 30` | `#D6D6D6` |
| `Color/Gray/Gray 40` | `#BFBFBF` |
| `Color/Gray/Gray 50` | `#A4A4A4` |
| `Color/Gray/Gray 60` | `#868686` |
| `Color/Gray/Gray 70` | `#676767` |
| `Color/Gray/Gray 80` | `#464646` |
| `Color/Gray/Gray 85` | `#353535` |
| `Color/Gray/Gray 90` | `#242424` |
| `Color/Gray/Gray 95` | `#191919` |

**Contrast pairs to know** (WCAG ratio, 4.5:1 needed for body text, 3:1 for large text)

| Foreground on background | Ratio | Verdict |
| --- | --- | --- |
| Core Black on Main Accent Pink | 8.29 | Pass. Default text on pink |
| Core White on Main Accent Pink | 2.03 | Fail. Never put white text on main pink |
| Core White on Pink 70 | 9.60 | Pass |
| Core White on Pink 80 | 13.75 | Pass |
| Main Accent Pink on Core Black | 8.29 | Pass |
| Main Accent Pink on Core White | 2.03 | Fail for text. Use pink as a fill, not as text, on light backgrounds |

### 1.2 Typography

| Role | Typeface | Weight | Rules |
| --- | --- | --- | --- |
| Display | n8n Baumer | Medium | Largest type on the layout |
| Headline | n8n Baumer | Medium | Headlines and titles |
| Body | n8n Baumer | Regular | Running text |
| Mono | n8n Baumer Mono | Regular | **Always ALL CAPS.** Used mainly inside capsules for dates, locations, labels and secondary info |

Font family names: the installed font files register as `n8n Baumer Uniwidth` (Regular, Medium) and `n8n Baumer Mono` (Regular). Use these exact strings in CSS `font-family` or a design tool's font picker, or the font will not resolve.

Ligatures: in all instances where n8n Baumer is applied, ensure the Standard Ligatures OpenType feature (`liga`) is activated. In CSS, set it explicitly rather than relying on the browser default:

```css
font-feature-settings: "liga" 1;
```

In design tools, turn on standard ligatures in the text's OpenType settings.

#### Type scale

These are the standard text styles for web and social posts. Use the text style names, and pick from this list rather than using an in-between size. Sizes are the same on Large desktop and Desktop.

Typefaces: Display and Headline use n8n Baumer Medium. Body uses n8n Baumer Regular, or Medium for emphasis. Mono and Code use n8n Baumer Mono Regular. Mono text is always ALL CAPS.

| Role | Text style | Size | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| Display | `display-lg` | 180px | 162px (90%) | -1% |
| Display | `display-md` | 160px | 144px (90%) | -1% |
| Display | `display-sm` | 120px | 108px (90%) | -1% |
| Headline | `heading-x-x-x-lg` | 80px | 80px | -1% |
| Headline | `heading-x-x-lg` | 56px | 56px | -1% |
| Headline | `heading-x-lg` | 48px | 48px | -1% |
| Headline | `heading-lg` | 40px | 42px | -1% |
| Headline | `heading-md` | 32px | 36px | 0 |
| Headline | `heading-sm` | 28px | 32px | 0 |
| Headline | `heading-x-sm` | 24px | 24px | 0 |
| Headline | `heading-xxs` (no text style yet) | 20px | not set yet | 0 |
| Body | `body-xl/regular`, `body-xl/medium` | 18px | 22px | 0 |
| Body | `body-lg/regular`, `body-lg/medium` | 16px | 20px | 0 |
| Body | `body-md/regular`, `body-md/medium` | 14px | 18px | 0 |
| Body | `body-sm/regular` (web only) | 10px | 14px | 0 |
| Mono (social) | `mono-social-lg` | 32px | 36px | 2% |
| Mono (social) | `mono-social-md` | 24px | 28px | 2% |
| Mono | `body-lg/mono` | 16px | 20px | 1% |
| Mono | `body-md/mono` | 14px | 18px | 2% |
| Mono | `body-sm/mono` (web only) | 10px | 14px | 0 |
| Code | `code` | 16px | 20px | 0 |

Anything larger than 80px is Display. Display line height is always 90% of the font size. Use the `mono-social` styles for capsules on social posts; the smaller mono styles are for web. `body-sm` (10px) is for web only: it becomes unreadable once a social post is shrunk in a feed, so the smallest body size for social is `body-md` (14px).

Letter spacing is a percentage of the font size. In CSS, -1% is `letter-spacing: -0.01em` and 2% is `letter-spacing: 0.02em`.

Where a value is "not set yet", choose one, keep it consistent with the neighbouring styles, and tell the user which value you chose.

Large-scale formats such as conference assets, event signage and out-of-home (OOH) may need sizes beyond this scale. For those, size the type to the asset and its grid (section 4), and check the sizes with the user.

#### Text wrapping

Set wrapping so lines break cleanly and nothing is left stranded.

- **Headlines and titles (Display, Headline, and short blocks of 4 lines or fewer):** use `text-wrap: balance`, so every line is a similar length.
- **Body copy and paragraphs (body text, descriptions, cards, multi-line blocks):** use `text-wrap: pretty`, so no single word is left alone on the last line (an orphan).

```css
.heading { text-wrap: balance; }
.body-text { text-wrap: pretty; }
```

In design tools without these settings, break lines by hand to get the same result: even line lengths in headlines, and no orphans in body copy.

### 1.3 Spacing

Built on the rule of 8. Every margin, gap and grid cell should be a multiple of 8. The 4px and 12px steps exist for fine adjustments inside small elements such as capsules.

| Token | Value |
| --- | --- |
| `Spacing/Space-4px` | 4 |
| `Spacing/Space-8px` | 8 |
| `Spacing/Space-12px` | 12 |
| `Spacing/Space-16px` | 16 |
| `Spacing/Space-24px` | 24 |
| `Spacing/Space-32px` | 32 |
| `Spacing/Space-40px` | 40 |
| `Spacing/Space-48px` | 48 |
| `Spacing/Space-64px` | 64 |
| `Spacing/Space-80px` | 80 |
| `Spacing/Space-88px` | 88 |
| `Spacing/Space-96px` | 96 |
| `Spacing/Space-120px` | 120 |
| `Spacing/Space-160px` | 160 |
| `Spacing/Space-240px` | 240 |

### 1.4 Corner radius

Multiples of 4.

| Token | Value | Typical use |
| --- | --- | --- |
| `Radius/none` | 0 | |
| `Radius/XS` | 4 | |
| `Radius/Small` | 8 | |
| `Radius/Medium` | 12 | |
| `Radius/Large` | 16 | |
| `Radius/XL` | 24 | |
| `Radius/Full` | 400 | Capsules (fully rounded pill ends) |

---

## 2. Core Brand Elements

### 2.1 Logo

**Never generate the logo.** Do not draw, trace, recreate, recolour or approximate the symbol or the wordmark in SVG, code, CSS or any other way. Always download the official files from the n8n brand portal.

**Logo files**

- Index of every file (with usage notes): https://guidelines.n8n.design/downloads/logo/manifest.json
- Full pack (zip): https://guidelines.n8n.design/downloads/logo/n8n-logo-pack.zip
- On light backgrounds use https://guidelines.n8n.design/downloads/logo/lockup/n8n-logo-black-accent.svg
- On dark backgrounds use https://guidelines.n8n.design/downloads/logo/lockup/n8n-logo-white-accent.svg
- Symbol only: https://guidelines.n8n.design/downloads/logo/symbol/n8n-symbol-accent.svg

Prefer SVG. Colours: accent `#FF91AC`, black `#191919`, white `#FAFAFA`.

If you cannot reach the brand portal, leave a clearly labelled placeholder and ask the user to add the logo. Do not substitute a drawn version.

**Available versions** (each has an `.svg` and a `.png`; the manifest lists both links)

| File | Contents |
| --- | --- |
| `n8n-logo-black-accent` | Full lockup, pink symbol + black wordmark |
| `n8n-logo-white-accent` | Full lockup, pink symbol + white wordmark |
| `n8n-logo-black` | Full lockup, all black |
| `n8n-logo-white` | Full lockup, all white |
| `n8n-symbol-accent` | Symbol only, pink |
| `n8n-symbol-black` | Symbol only, black |
| `n8n-symbol-white` | Symbol only, white |

**Symbol or full lockup?**

- **Symbol only**: when brand recognition is already close by. For example, assets for n8n's own social channels, where the company name sits right next to the post. The symbol can also be used independently in applications where the full lockup is impractical, including favicons, app icons, stickers, and physical objects. In these contexts it carries the full weight of recognition on its own.
- **Full lockup (symbol + wordmark)**: whenever the brand needs to be recognised on its own. Campaigns, partnerships, collaborations, all paid media, YouTube paid ads.

If you cannot tell which applies, ask.

**Colour preference**

Prefer the pink versions: `n8n-logo-black-accent` on light backgrounds, `n8n-logo-white-accent` on dark backgrounds, `n8n-symbol-accent` when using the symbol alone.

**Contrast is mandatory.** The logo must always read clearly against what sits behind it. Switch to the black or white version when pink does not have enough contrast.

| Background | Use |
| --- | --- |
| Light mode backgrounds (whites, light greys) | `n8n-logo-black-accent` or `n8n-symbol-accent`. Use `n8n-logo-black` or `n8n-symbol-black` if the pink disappears |
| Dark mode backgrounds (dark greys, black) | `n8n-logo-white-accent` or `n8n-symbol-accent` |
| Main Accent Pink or light pinks (Pink 10 to 30) | `n8n-logo-black` or `n8n-symbol-black` only. Never a pink logo on pink |
| Deep pinks (Pink 70 to 90) | `n8n-logo-white` or `n8n-symbol-white`, or the accent versions where the pink clearly stands out |
| Maker mode greys | The black or white versions, whichever has more contrast. Pink on Gray 40 is only 1.15:1 |
| Photography | The black or white versions, whichever reads clearly over that part of the image |

### 2.2 Graphic devices

#### Capsule

The capsule houses secondary content: dates, locations, subheaders, categories, event names. It is a pill shape (`Radius/Full`) with text in **n8n Baumer Mono, Regular, ALL CAPS**.

**Labels only, never sentences.** A capsule holds a single word or a short label, such as a date, location, category or event name (for example `COMMUNITY WORKFLOWS` or `JULY 2026`). Never put a full sentence, a question or punctuated copy inside a capsule. If the content needs a sentence, it belongs in a headline or body copy instead.

- Fill: `Background/Accent Pink` for the leading or most important capsule, and a grey background token for supporting capsules. Only use the brand pink and the greys.
- Text: `Type/Primary` of the current mode.
- Padding: from the spacing scale, multiples of 4 or 8.

Two styles, chosen by context:

1. **Connected capsules (with dots).** Use when two or more capsules sit next to each other in a row. Solid round dots sit on the capsules' left and right ends, vertically centred. Neighbouring capsules share a single dot between them. The dots reference the node connectors in the n8n product, so the row reads like a small workflow. Colour the dots with `Capsule Connector Dot/Dot` (black in Light mode, white in Dark and Maker mode).
   - **How connected capsules join:** the capsules butt directly against each other with 0 spacing between them. A single node dot sits centred on the join and connects the two. Never leave a gap between connected capsules, and never show two dots side by side at a join. A row of capsules always reads: dot, capsule, dot, capsule, dot.
2. **Standalone capsule (with crosshairs).** Use when a capsule sits on its own, or when capsules are stacked vertically rather than connected. Small plus-shaped crosshairs sit just outside the capsule's corners. Colour them with `Stroke + Crosshairs/Secondary`.

Do not mix both styles on one capsule. Do not mix both capsule styles within the same layout.

#### Deboss

The deboss is a digital version of a physical deboss pressed into paper. It makes the brand feel tactile. Use it to house headlines and body copy when you need to draw attention to them.

How to build it: a shape (usually rounded, using a radius token) filled with the **same background colour as the surface around it**, with two inner shadows applied. The shadows make it look pressed into the page, not placed on top of it.

There are two families. Choose S, M or L to match the size of the container.

- **Deboss Primary**: on any neutral background (white, grey, dark).
- **Deboss Pinks**: only on the accent pink background. Combine it with the `Background/Accent Pink` token of the current mode.

**Geometry (identical across modes)**

| Effect style | Top-left inner shadow | Bottom-right inner shadow |
| --- | --- | --- |
| `Deboss Primary/Deboss S` | x 4, y 4, blur 8, spread 0 | x -4, y -4, blur 8, spread 0 |
| `Deboss Primary/Deboss M` | x 8, y 8, blur 12, spread 0 | x -8, y -8, blur 12, spread 0 |
| `Deboss Primary/Deboss L` | x 12, y 12, blur 16, spread 0 | x -12, y -12, blur 16, spread 0 |
| `Deboss Pinks/Deboss S` | x 4, y 4, blur 8, spread 0 | x -4, y -4, blur 8, spread 0 |
| `Deboss Pinks/Deboss M` | x 6, y 6, blur 16, spread 0 | x -6, y -6, blur 8, spread 0 |
| `Deboss Pinks/Deboss L` | x 12, y 12, blur 22, spread 0 | x -12, y -12, blur 22, spread 0 |

All shadows are inner shadows with normal blend mode.

**Colours per mode**

| Mode | Primary: top-left | Primary: bottom-right | Pinks: top-left | Pinks: bottom-right |
| --- | --- | --- | --- | --- |
| Light | `#EAEAEA` (Gray 20) | `#FFFFFF` (Gray 0) | `#DB6B87` at 50% | `#FFBCCA` at 50% |
| Dark | `#191919` (Gray 95) | `#FAFAFA` at 10% | `#44001B` (Pink 90) | `#661A2D` |
| Maker | `#191919` at 10% | `#FAFAFA` at 20% | `#191919` at 10% | `#FAFAFA` at 20% |

Variable names: `Deboss Inner Shadows/Top Left, Inner shadow`, `Deboss Inner Shadows/Bottom Right, Inner shadow`, `Deboss Inner Shadows/Top Left, Accent Inner shadow`, `Deboss Inner Shadows/Bottom Right, Accent Inner shadow`.

CSS example (Deboss Primary M, Light mode):

```css
.deboss-m {
  background: #FAFAFA; /* same as the surface around it */
  box-shadow:
    inset 8px 8px 12px 0 #EAEAEA,
    inset -8px -8px 12px 0 #FFFFFF;
}
```

#### Dot grid

The dot grid is a nod to the canvas grid in the n8n product. Use it as a texture in layouts, usually with a headline set over the top of it.

- Dots: `Dot Grid/Primary` by default, `Dot Grid/Accent` for a pink variation.
- Align the dot spacing with the layout grid (section 4) so dots land in step with the grid.
- Keep it behind content. It should never compete with the headline.

---

## 3. Graphic Modes (Semantic tokens)

Every design is made in one of three modes. Pick one first. Then take every colour from that mode's column below.

- **Light (default)**: light designs on a white or near-white background. Photography allowed. This is the preferred mode for most layouts and most touchpoints across the brand. If you are unsure which mode to use, use Light.
- **Dark**: dark designs using deep, almost black greys. Photography allowed. This is the preferred mode for enterprise deliverables.
- **Maker**: the in-between mode, the space where making happens. Treat it like a wireframe. No images or photography, just greys and whites. Use it for touchpoints that are a work in progress, such as workshop deliverables, and to set apart spaces where people create and build things, such as a workshop area at an n8n conference.

Collection: `Graphic Modes`. Token names are the same in every mode. Only the values change.

| Token | Light | Dark | Maker |
| --- | --- | --- | --- |
| `Background/Primary` | Gray 05 `#FAFAFA` | Gray 95 `#191919` | Gray 40 `#BFBFBF` |
| `Background/Secondary` | Gray 15 `#F1F1F1` | Gray 90 `#242424` | Gray 60 `#868686` |
| `Background/Tertiary` | Gray 20 `#EAEAEA` | Gray 80 `#464646` | Gray 70 `#676767` |
| `Background/Accent Pink` | Main Accent Pink `#FF91AC` | Pink 80 `#5A0026` | Pink 30 `#FFBCCA` |
| `Type/Primary` | Core Black `#191919` | Core White `#FAFAFA` | Gray 10 `#F8F8F8` |
| `Type/Secondary` | Black 50% | White 70% | White 70% |
| `Type/Tertiary Buttons` | Core Black | Core Black | Core Black |
| `Type/Accent` | Main Accent Pink | Main Accent Pink | Main Accent Pink |
| `Interactive Primary/Default` | Gray 15 | Gray 85 | Gray 40 |
| `Interactive Primary/Hover` | Gray 10 | Gray 70 | Gray 30 |
| `Interactive Primary/Pressed` | Gray 15 | Gray 80 | Gray 25 |
| `Interactive Primary/Focused` | Main Accent Pink | Main Accent Pink | Main Accent Pink |
| `Interactive Accent/Default` | Main Accent Pink | Main Accent Pink | Gray 40 |
| `Interactive Accent/Hover` | Pink 20 | Pink 20 | Gray 60 |
| `Interactive Accent/Pressed` | Pink 30 | Pink 30 | Gray 50 |
| `Interactive Accent/Focused` | Main Accent Pink | Main Accent Pink | Main Accent Pink |
| `Dot Grid/Primary` | Gray 30 `#D6D6D6` | Gray 80 `#464646` | Gray 50 `#A4A4A4` |
| `Dot Grid/Accent` | Pink 20 `#FFD0D9` | Pink 20 `#FFD0D9` | Gray 15 `#F1F1F1` |
| `Stroke + Crosshairs/Primary` | Gray 40 `#BFBFBF` | Core White `#FAFAFA` | Core White `#FAFAFA` |
| `Stroke + Crosshairs/Secondary` | Gray 25 `#E0E0E0` | Gray 70 `#676767` | Gray 20 `#EAEAEA` |
| `Stroke + Crosshairs/Accent` | Main Accent Pink | Main Accent Pink | Main Accent Pink |
| `Capsule Connector Dot/Dot` | Core Black `#191919` | Core White `#FAFAFA` | Core White `#FAFAFA` |

Mode-specific notes:

- Light: pink is a fill, not a text colour. `Type/Accent` pink on a light background fails contrast for text (2.03:1). Use it for large graphic shapes only.
- Dark: `Type/Accent` pink on the dark backgrounds passes comfortably.
- Maker: `Type/Primary` (`#F8F8F8`) on `Background/Primary` (`#BFBFBF`) is only 1.73:1. Place white text on `Background/Tertiary` (5.42:1), or check with the user before setting text directly on the primary Maker background.

---

## 4. The Grid

The whole identity is dictated by the grid. It is a **cross grid**: horizontal and vertical lines that divide the layout into even cells. Elements are placed on those cells and distributed evenly across the layout.

**How to build the grid for a new asset**

1. Start from the asset size (for example 1080×1080, 1080×1350, 1920×1080).
2. Choose an outer margin from the spacing scale (multiple of 8).
3. Divide the remaining area into equal columns and rows. Cell sizes and any gutters must be multiples of 8. Adjust the number of cells until they divide evenly.
4. Draw the cross grid: vertical and horizontal lines at every cell boundary.
5. Snap every element to the grid: capsules, headlines, images, the logo, deboss containers. Edges start and end on grid lines.
6. Keep the dot grid in step with the cross grid so dots fall on or evenly between the lines.

**The cross grid is invisible.** It is only a tool for working out where things go. Use it to calculate positions, then leave it out of the output completely. Do not draw its lines, and do not add it as layout guides, overlays or helper layers in the file, canvas or design tool, even as a way of showing your working. Only show it if the user explicitly asks to see the grid.

The dot grid (section 2.2) is different: it is a visible graphic device and does appear on the design.

**Reference layout patterns** (from approved n8n work)

- **Social / event graphic, 16:9, Light mode**: connected capsules top left (category + date, pink then grey), `n8n-symbol-accent` top right (own channel, so symbol only), a large Display headline over a dot grid on the left half, and a photo with rounded corners filling the right half. Everything sits inside an outer frame with a rounded radius.
- **Vertical event poster, Light mode**: headline top left over a dot grid, an illustration built from dots and nodes in the middle, and stacked standalone capsules with crosshairs at the bottom (event series in pink, event name in grey).

---

## 5. Tone of Voice

Applies to every word on a design: headlines, body copy and capsule labels.

**Our voice** is a clear-thinking, experienced builder: confident, generous with knowledge and committed to helping others move forward. Explain clearly without fluff, assume technical competence and never talk down.

- **We are:** concise, helpful, technical, supportive, authentic, accessible.
- **We are not:** flowery, juvenile, cheesy, condescending, misleading, exclusive.

**Writing principles**

| Principle | Do | Don't |
| --- | --- | --- |
| Clear over clever | Code when you need it. UI when you don't. | Seamlessly unlock powerful capabilities. |
| Confident over loud | Build powerful workflows that can run reliably at any scale. | Our incredible technology completely transforms the way you'll use AI. |
| Helpful over impressive | Start simple. Add branching, retries, or custom code when you need it. | Unlock enterprise-grade automation in seconds. |
| Specific over vague | Start with a simple trigger. Add logic as your workflow grows. | Integrate external systems to unlock next-level efficiency. |

**Style rules**

- American English.
- Always write n8n in lowercase.
- Sentence case for all headlines and titles. Only the first word and proper nouns are capitalised.
- No exclamation marks, ampersands or all caps. The one exception is Mono text in capsules, which is always ALL CAPS (section 1.2).
- No emojis in brand copy. Use them sparingly, on social channels only.
- No jargon, clichés, buzzwords or slang. Write for a global audience.
- Back every claim with a fact, feature or attributable result. Never invent stats.
- Use the active voice. Define acronyms on first use.

**Messaging pillars:** every piece should reinforce at least one.

- **Simplicity:** make automation feel approachable.
- **Product-led:** show, don't tell. Prefer real screenshots and workflows over abstract claims.
- **Authenticity:** no hype. Talk about what the product actually does.
- **Community:** write as a peer, not a broadcaster.

---

## 6. Agent checklist before handing back

- [ ] One Graphic Mode chosen to fit the touchpoint (Light by default, Dark for enterprise, Maker for work in progress and making spaces), and all colours come from its tokens
- [ ] Logo downloaded from the brand portal (or left as a labelled placeholder), never generated or recoloured
- [ ] Symbol vs full lockup matches the use case
- [ ] Logo, text and capsules all pass contrast against their background
- [ ] Headlines in n8n Baumer Medium, body in n8n Baumer Regular
- [ ] Headlines use balanced wrapping and body copy uses pretty wrapping (no orphans)
- [ ] Font sizes come from the type scale (web and social), or were checked with the user for large-scale and OOH formats
- [ ] All mono text is n8n Baumer Mono and ALL CAPS
- [ ] Capsules hold short labels or single words only, never full sentences
- [ ] Copy follows the Tone of Voice: sentence case, American English, lowercase n8n, no exclamation marks, no hype
- [ ] Capsules use dots when connected, crosshairs when standalone, and only one capsule style per layout
- [ ] Every spacing and grid value is a multiple of 8 (4 and 12 only for fine detail)
- [ ] Every radius comes from the radius tokens
- [ ] Deboss uses the exact effect values for the current mode
- [ ] Maker mode designs contain no images
- [ ] Everything snaps to the cross grid, and the cross grid itself is not visible anywhere in the output (no lines, guides or overlays)

---

## 7. Open items for the design team

These are gaps an agent should ask about rather than fill in.

- Maker mode `Type/Primary` on `Background/Primary` fails contrast (1.73:1).
- `heading-xxs` (20px) has no text style or line height yet.
- No logo clear space or minimum size yet.
- Motion (UI and Film modes) is not documented here yet.
- Opacity tokens are in the file but intentionally left out of this document for now.
