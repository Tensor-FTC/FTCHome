import type { PartsTier } from './types'

/**
 * Starter bills of materials, three tiers deep. Transcribed from the design
 * source; prices are USD list and deliberately round, because the screen's job
 * is "what does year one cost", not invoicing.
 */
function items(
  group: string,
  rows: [name: string, partNumber: string, vendor: string, qty: number, unit: number][],
) {
  return rows.map(([name, partNumber, vendor, qty, unit]) => ({
    id: `${group}:${partNumber}`,
    group,
    name,
    partNumber,
    vendor,
    qty,
    unit,
  }))
}

export const PARTS_TIERS: PartsTier[] = [
  {
    id: 'bare',
    label: 'Bare min',
    items: [
      ...items('Control', [
        ['REV Control Hub', 'REV-31-1595', 'REV', 1, 299],
        ['Driver Hub', 'REV-31-1596', 'REV', 1, 249],
        ['12V slim battery', 'REV-31-1302', 'REV', 2, 39],
      ]),
      ...items('Drivetrain', [
        ['Yellow Jacket 312 RPM', '5203-2402-0019', 'goBILDA', 4, 44],
        ['96mm mecanum set', '3213-3606-0001', 'goBILDA', 1, 169],
        ['Channel, 336mm', '1120-0043-0336', 'goBILDA', 4, 14],
      ]),
      ...items('Structure', [
        ['U-channel kit', '1120-KIT', 'goBILDA', 1, 129],
        ['M4 hardware pack', '2800-0004-0100', 'goBILDA', 2, 22],
      ]),
    ],
  },
  {
    id: 'rookie',
    label: 'Rookie',
    items: [
      ...items('Control', [
        ['REV Control Hub', 'REV-31-1595', 'REV', 1, 299],
        ['Driver Hub', 'REV-31-1596', 'REV', 1, 249],
        ['12V slim battery', 'REV-31-1302', 'REV', 3, 39],
        ['Logitech F310 pair', '940-000110', 'Logitech', 2, 29],
      ]),
      ...items('Drivetrain', [
        ['Yellow Jacket 312 RPM', '5203-2402-0019', 'goBILDA', 4, 44],
        ['96mm mecanum set', '3213-3606-0001', 'goBILDA', 1, 169],
        ['Channel, 336mm', '1120-0043-0336', 'goBILDA', 6, 14],
      ]),
      ...items('Manipulator', [
        ['Servo, 5-turn', '2000-0025-0002', 'goBILDA', 4, 24],
        ['Compliant wheel 70mm', '3606-0070-0001', 'goBILDA', 6, 9],
        ['Viper slide kit', '3407-0500-0001', 'goBILDA', 1, 159],
      ]),
      ...items('Shop', [
        ['Hex driver set', 'HD-SET-9', 'Wera', 1, 64],
        ['PLA+ filament, 1kg', 'PLA-1K-BLK', 'Prusa', 3, 26],
      ]),
    ],
  },
  {
    id: 'comp',
    label: 'Competitive',
    items: [
      ...items('Control', [
        ['REV Control Hub', 'REV-31-1595', 'REV', 1, 299],
        ['Driver Hub', 'REV-31-1596', 'REV', 1, 249],
        ['12V slim battery', 'REV-31-1302', 'REV', 5, 39],
        ['Odometry pod ×3', '3110-0001-0001', 'goBILDA', 3, 59],
        ['Limelight 3A', 'LL-3A', 'Limelight', 1, 399],
      ]),
      ...items('Drivetrain', [
        ['Yellow Jacket 435 RPM', '5203-2402-0014', 'goBILDA', 4, 44],
        ['104mm mecanum set', '3213-3606-0002', 'goBILDA', 1, 199],
        ['Channel, 336mm', '1120-0043-0336', 'goBILDA', 8, 14],
      ]),
      ...items('Manipulator', [
        ['Servo, 5-turn', '2000-0025-0002', 'goBILDA', 6, 24],
        ['Viper slide kit', '3407-0500-0001', 'goBILDA', 2, 159],
        ['Carbon tube, 500mm', 'CF-20-500', 'Rocket', 4, 21],
      ]),
      ...items('Shop', [
        ['Hex driver set', 'HD-SET-9', 'Wera', 1, 64],
        ['PLA+ filament, 1kg', 'PLA-1K-BLK', 'Prusa', 6, 26],
        ['Practice field tiles', 'FT-12', 'AndyMark', 1, 189],
      ]),
    ],
  },
]

export function tierById(id: PartsTier['id']): PartsTier {
  return PARTS_TIERS.find((t) => t.id === id) ?? PARTS_TIERS[1]
}

/** Distinct group names, in the order they first appear in the tier. */
export function groupsOf(tier: PartsTier): string[] {
  return [...new Set(tier.items.map((i) => i.group))]
}
