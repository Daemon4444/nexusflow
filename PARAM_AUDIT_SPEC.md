# Parameter Passthrough Audit & Fix Spec

## Summary

Full audit of NexusFlow parameter passthrough for all video/image models against upstream API documentation.
Date: 2026-05-24

---

## Issues Found

### 1. PixVerse Official API — Missing Parameters

**Upstream supports but we don't pass:**
| Parameter | Description | Impact |
|-----------|-------------|--------|
| `style` | Visual style (anime, cyberpunk, comic, clay, 3d_animation) | Users can't control style |
| `camera_movement` | Camera direction (zoom_in, horizontal_left, etc.) | Users can't control camera |
| `water_mark` | Watermark control | Note: upstream uses `water_mark` not `watermark` |
| `audio` / `generate_audio_switch` | Audio generation | Users can't get audio |
| `multi_shot` | Multi-camera sequences | Missing feature |

**Parameters with naming mismatch:**
| Our param | PixVerse param | Status |
|-----------|---------------|--------|
| `quality` | `quality` | OK (540p, 720p, 1080p) |
| `aspect_ratio` | `aspect_ratio` | OK |
| `motion_mode` | `motion_mode` | OK (normal, performance) |
| `img_url` | `img_url` | OK |
| `seed` | `seed` | OK |
| `negative_prompt` | `negative_prompt` | OK |
| (missing) | `style` | MISSING |
| (missing) | `camera_movement` | MISSING |
| (missing) | `water_mark` | MISSING |
| (missing) | `audio` | MISSING |

### 2. PixVerse via DashScope (百炼) — Missing Parameters

**Upstream supports but we don't pass:**
| Parameter | Description | Impact |
|-----------|-------------|--------|
| `parameters.audio` | Audio generation (bool) | Users can't get audio |
| `parameters.watermark` | Watermark (bool) | Already in params obj but NOT sent |
| `parameters.shot_type` | single/multi shot | Missing for multi-shot |
| `parameters.seed` | Reproducibility | NOT sent in adaptVideoRequest |

**Current `adaptVideoRequest` sends:**
- `input.prompt` ✓
- `input.negative_prompt` ✓
- `parameters.size` ✓
- `parameters.duration` ✓
- `parameters.prompt_extend` ✓

**Missing from `adaptVideoRequest`:**
- `parameters.seed`
- `parameters.watermark`
- `parameters.audio`
- `parameters.shot_type`
- `input.audio_url`

### 3. wan2.6-i2v / wan2.6-i2v-flash — Missing Parameters

**Upstream supports but we don't pass:**
| Parameter | Description | Impact |
|-----------|-------------|--------|
| `parameters.resolution` | 720P/1080P (i2v uses resolution not size) | Aspect ratio from image is auto-maintained |
| `parameters.audio` | Audio generation | Only for i2v-flash |
| `parameters.shot_type` | single/multi | Multi-shot |
| `parameters.watermark` | Watermark | Missing |
| `parameters.seed` | Reproducibility | Missing |
| `input.audio_url` | Custom audio URL | Missing |

**Note:** i2v uses `parameters.resolution` (720P/1080P) NOT `parameters.size` (width*height).
Current code sends `parameters.size` which may be wrong for i2v models.

### 4. wan2.6-r2v — Parameter Structure Wrong

Current `adaptVideoRequest` sends:
```json
{ "input": { "reference_urls": [...] } }
```

But upstream wan2.6-r2v actually expects `input.reference_urls` as a flat string array. This is currently correct.

However, missing parameters:
- `parameters.seed`
- `parameters.watermark`
- `parameters.audio`
- `parameters.shot_type`
- `input.audio_url`

### 5. HappyHorse — Audit OK

HappyHorse adapter looks correct. All documented parameters are passed through. No issues found.

### 6. Image Generation (wan2.6-t2i / qwen-image-max) — Minor Issues

- `seed` not extracted in image.ts route (silently dropped)
- `image_url` not extracted in image.ts route (user sends `image_url`, adapter expects it but route doesn't extract)

---

## Fix Plan

### Fix A: `adaptPixVerseRequest` — Add missing parameters

Add support for: `style`, `camera_movement`, `water_mark`, `audio`

### Fix B: `adaptVideoRequest` — Add missing parameters

Add support for: `seed`, `watermark`, `audio`, `shot_type`, `audio_url`

Special handling for i2v models: use `parameters.resolution` instead of `parameters.size`

### Fix C: `tasks.ts` / `video.ts` — Extract and pass new parameters

Ensure new params from user request body flow through to adapters.

### Fix D: `image.ts` — Extract `image_url` and `seed`

Add `image_url` and `seed` to destructuring.

### Fix E: Update frontend docs

Update API documentation pages to reflect all supported parameters.

---

## Files to Modify

1. `backend/src/services/adapters.ts` — Core parameter passthrough fixes
2. `backend/src/routes/tasks.ts` — Already uses `...params` spread (minimal change)
3. `backend/src/routes/video.ts` — Extract new params
4. `backend/src/routes/image.ts` — Extract `image_url` and `seed`
5. `frontend/app/(dashboard)/docs/api/pixverse/page.tsx` — Update docs
6. `frontend/app/(dashboard)/docs/api/parameters/page.tsx` — Update parameter matrix
