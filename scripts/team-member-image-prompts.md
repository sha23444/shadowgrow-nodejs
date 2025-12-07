# Team Member Image Generation Prompts

Use these prompts with AI image generators (DALL-E, Midjourney, Stable Diffusion, etc.) to create professional team member photos.

## General Style Guidelines
- Professional headshot/portrait style
- Clean, modern background (white, light gray, or subtle gradient)
- Business casual to professional attire
- Friendly, approachable expression
- High quality, photorealistic
- Square aspect ratio (1:1) recommended for avatars
- Well-lit, professional photography style

---

## Individual Prompts for Each Team Member

### 1. Sarah Johnson - Senior Firmware Developer
**Prompt:**
```
Professional headshot portrait of a confident female software engineer in her early 30s, 
wearing a modern business casual blazer, friendly smile, short brown hair, 
clean white background, professional photography, high quality, 4K, 
tech industry professional, approachable and intelligent expression
```

### 2. Michael Chen - Mobile Device Specialist
**Prompt:**
```
Professional headshot portrait of an Asian male technician in his late 20s, 
wearing a smart casual shirt, warm smile, black hair, 
clean light gray background, professional photography, high quality, 4K, 
mobile technology expert, friendly and knowledgeable expression
```

### 3. Emily Rodriguez - Android Development Lead
**Prompt:**
```
Professional headshot portrait of a confident Hispanic female tech lead in her early 30s, 
wearing a professional blouse, bright smile, long dark hair, 
clean white background, professional photography, high quality, 4K, 
software development leader, energetic and professional expression
```

### 4. David Kim - Firmware Testing Engineer
**Prompt:**
```
Professional headshot portrait of a Korean male engineer in his mid-30s, 
wearing a business casual shirt, friendly smile, neat black hair, 
clean light blue background, professional photography, high quality, 4K, 
quality assurance professional, detail-oriented and approachable expression
```

### 5. Priya Patel - Custom ROM Developer
**Prompt:**
```
Professional headshot portrait of an Indian female developer in her late 20s, 
wearing a modern professional top, warm smile, long dark hair, 
clean white background, professional photography, high quality, 4K, 
open-source developer, creative and intelligent expression
```

### 6. James Wilson - Device Support Specialist
**Prompt:**
```
Professional headshot portrait of a British male support specialist in his early 30s, 
wearing a business casual shirt, friendly smile, short brown hair, 
clean light gray background, professional photography, high quality, 4K, 
customer service professional, helpful and approachable expression
```

### 7. Lisa Anderson - Quality Assurance Manager
**Prompt:**
```
Professional headshot portrait of a confident female manager in her mid-30s, 
wearing a professional blazer, warm smile, shoulder-length blonde hair, 
clean white background, professional photography, high quality, 4K, 
quality assurance manager, leadership and professional expression
```

### 8. Ahmed Hassan - Mobile Repair Technician
**Prompt:**
```
Professional headshot portrait of a Middle Eastern male technician in his early 30s, 
wearing a smart casual shirt, friendly smile, short dark hair and beard, 
clean light gray background, professional photography, high quality, 4K, 
mobile repair expert, skilled and approachable expression
```

---

## Batch Generation Prompt (All 8 at once)

If your AI tool supports generating multiple variations:

**Prompt:**
```
Generate 8 diverse professional headshot portraits for a tech company team:
1. Female software engineer, early 30s, brown hair, business casual
2. Asian male technician, late 20s, black hair, smart casual
3. Hispanic female tech lead, early 30s, dark hair, professional
4. Korean male engineer, mid-30s, black hair, business casual
5. Indian female developer, late 20s, dark hair, modern professional
6. British male support specialist, early 30s, brown hair, business casual
7. Female manager, mid-30s, blonde hair, professional blazer
8. Middle Eastern male technician, early 30s, dark hair and beard, smart casual

All with: clean backgrounds (white/light gray), friendly expressions, 
professional photography style, high quality, 4K, square format, 
tech industry professionals, diverse and inclusive representation
```

---

## Alternative: Using Existing Avatar Services

If you prefer using avatar generation services, you can use:

1. **Pravatar.cc** (already in use): `https://i.pravatar.cc/150?img={number}`
   - Numbers 1-70 available
   - Example: `https://i.pravatar.cc/150?img=1`

2. **UI Avatars**: `https://ui-avatars.com/api/?name={Name}&size=150&background=random`
   - Example: `https://ui-avatars.com/api/?name=Sarah+Johnson&size=150&background=random`

3. **DiceBear Avatars**: `https://api.dicebear.com/7.x/{style}/svg?seed={name}`
   - Styles: avataaars, personas, initials, etc.
   - Example: `https://api.dicebear.com/7.x/avataaars/svg?seed=SarahJohnson`

---

## Recommended Image Specifications

- **Format**: JPG or PNG
- **Size**: 400x400px minimum (800x800px recommended)
- **Aspect Ratio**: 1:1 (square)
- **Background**: White, light gray, or transparent
- **Style**: Professional headshot, business portrait
- **Quality**: High resolution, sharp focus

---

## Usage Instructions

1. Copy any individual prompt above
2. Paste into your AI image generator (DALL-E, Midjourney, Stable Diffusion, etc.)
3. Generate the image
4. Download and save with descriptive filename (e.g., `sarah-johnson.jpg`)
5. Upload to your server/media storage
6. Update the `photo` field in the database with the new image URL

---

## Quick Update Script

After generating images, you can update the database with:

```sql
UPDATE res_team SET photo = 'https://your-domain.com/images/team/sarah-johnson.jpg' WHERE name = 'Sarah Johnson';
UPDATE res_team SET photo = 'https://your-domain.com/images/team/michael-chen.jpg' WHERE name = 'Michael Chen';
-- ... and so on for all 8 members
```

