/**
 * Profile pictures, and what to draw when there is not one.
 *
 * Almost nobody uploads a photo, so the initials *are* the avatar for most of a
 * season. Drawing every one of them in the same grey made a roster of twenty
 * students into twenty identical circles, which is worse than useless in a list
 * you scan — the colour is the thing your eye actually uses to find a row again.
 *
 * So a colour is assigned from the name by default, and can be changed. Derived
 * rather than stored means it is stable across devices with nothing to sync,
 * and a brand-new member has a distinct avatar before anybody has touched a
 * setting.
 */

export const AVATAR_COLORS = [
  'slate',
  'red',
  'amber',
  'lime',
  'teal',
  'blue',
  'violet',
  'rose',
] as const

export type AvatarColor = (typeof AVATAR_COLORS)[number]

export const AVATAR_HEX: Record<AvatarColor, string> = {
  slate: '#5b6a70',
  red: '#c0453a',
  amber: '#b3761b',
  lime: '#6f8c25',
  teal: '#1f7f74',
  blue: '#3b6fb5',
  violet: '#6f5bb8',
  rose: '#b34a68',
}

export const AVATAR_COLOR_LABEL: Record<AvatarColor, string> = {
  slate: 'Slate',
  red: 'Red',
  amber: 'Amber',
  lime: 'Lime',
  teal: 'Teal',
  blue: 'Blue',
  violet: 'Violet',
  rose: 'Rose',
}

/**
 * A stable colour for a name.
 *
 * FNV-1a rather than summing char codes: a sum gives "Ana" and "Naa" the same
 * answer, and a roster of siblings with similar names would come out all one
 * colour, which is the exact thing this is meant to prevent.
 */
export function defaultAvatarColor(name: string): AvatarColor {
  let hash = 0x811c9dc5
  for (const ch of name.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function avatarHex(name: string, chosen?: string): string {
  const key = (chosen ?? '') as AvatarColor
  return AVATAR_HEX[key] ?? AVATAR_HEX[defaultAvatarColor(name)]
}

/**
 * Shrink a picked image to something a season can carry.
 *
 * Avatars sync inside the member record, so a 4 MB phone photo would go into
 * every device's copy of the roster and into every outbox entry. 96px square is
 * larger than the biggest place one is drawn, and lands around 4–8 KB as JPEG.
 *
 * Cropped to a centred square first, because an avatar is drawn in a circle and
 * squashing a portrait to fit is the one result nobody wants.
 */
export async function toAvatarDataUrl(file: Blob, size = 96): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read that image')
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    bitmap.close()
  }
}
