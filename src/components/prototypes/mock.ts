// Shared placeholder content so all five style variations mock the same
// feature set and can be compared fairly. Nothing here touches real data.

export interface MockCard {
  name: string;
  gradient: string;
}

export const MOCK_CARDS: MockCard[] = [
  { name: 'Charizard Holo', gradient: 'linear-gradient(160deg, #f97316, #7c2d12)' },
  { name: 'Pikachu VMAX', gradient: 'linear-gradient(160deg, #facc15, #854d0e)' },
  { name: 'Blastoise EX', gradient: 'linear-gradient(160deg, #38bdf8, #1e3a8a)' },
  { name: 'Venusaur GX', gradient: 'linear-gradient(160deg, #4ade80, #14532d)' },
  { name: 'Mewtwo PSA 9', gradient: 'linear-gradient(160deg, #c084fc, #4c1d95)' },
  { name: 'Reshiram ex', gradient: 'linear-gradient(160deg, #fb7185, #7f1d1d)' },
  { name: 'Umbreon Alt Art', gradient: 'linear-gradient(160deg, #64748b, #0f172a)' },
  { name: 'Shining Gyarados', gradient: 'linear-gradient(160deg, #f472b6, #831843)' },
];

export interface MockSetting {
  label: string;
  hint: string;
  kind: 'toggle' | 'slider';
  value: boolean | number; // toggle: on/off — slider: 0..1
}

export const MOCK_SETTINGS: MockSetting[] = [
  { label: 'Reflective floor', hint: 'Mirror-polish gallery floor', kind: 'toggle', value: true },
  { label: 'Bloom & vignette', hint: 'Cinematic post-processing', kind: 'toggle', value: true },
  { label: 'Soft shadows', hint: 'PCF shadow filtering', kind: 'toggle', value: false },
  { label: 'Spotlight warmth', hint: 'Track-light color temperature', kind: 'slider', value: 0.7 },
  { label: 'Ambient level', hint: 'Base room brightness', kind: 'slider', value: 0.25 },
];

export const MOCK_PLANS = [
  { name: 'Collect-A-Con Dallas', detail: '50 boxes · 61 tables · 29×20 m' },
  { name: 'Local card show', detail: '14 boxes · 16 tables · 18×12 m' },
];

export const MOCK_STATS = [
  { label: 'Cards', value: '9' },
  { label: 'Banner', value: 'Set' },
  { label: 'Saved plans', value: '2' },
];
