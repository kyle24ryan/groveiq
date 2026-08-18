// Maps each WH51 soil sensor's Ecowitt channel (1-5) to the tree it's
// physically planted in. There's no way to derive this from the API --
// the gateway just reports "channel 3," not which pot channel 3 is in --
// so this has to be confirmed against the real installation and updated
// by hand if a sensor is ever moved.
//
// Confirmed against the physical install by the user, 2026-08-18.
export const SOIL_CHANNEL_TREE_MAP: Record<number, string> = {
  1: 'mountain-hemlock',
  2: 'dawn-redwood',
  3: 'yellow-cedar-1',
  4: 'yellow-cedar-2',
  5: 'silver-fir',
};

export function treeIdForSoilChannel(channel: number): string | null {
  return SOIL_CHANNEL_TREE_MAP[channel] ?? null;
}
