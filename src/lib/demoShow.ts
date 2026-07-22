/**
 * Demo-show manifest (UX Wave A — Stream A1). A fully bundled, account-free
 * convention hall mounted at /demo: the plan image + rects came from running
 * the app's own detection on `floorplan_example.png` (50 boxes, inferred
 * scale), then 4 fictional vendors were hand-assigned to 6 booths and the
 * spawn point placed at the bottom-center entrance. The demo screen turns
 * bundled image URLs into Blobs so the hall's binder / sleeve-texture
 * pipeline runs unchanged, and feeds planMeta straight into planToLayout
 * like any saved plan.
 *
 * Everything here is fictional demo data — creatures, vendors, prices.
 */
import type { VendorPlanMeta } from './vendorPlan';
import type { InventoryItemRecord } from './db';
import type { VendorSummary } from './useVendors';
import type { HallSignageConfig } from './hallSignage';

import planImageUrl from '../assets/demo/floorplan.webp';
import emberdrake from '../assets/demo/cards/emberdrake.webp';
import cinderImp from '../assets/demo/cards/cinder-imp.webp';
import solarGryphon from '../assets/demo/cards/solar-gryphon.webp';
import duskwingSerpent from '../assets/demo/cards/duskwing-serpent.webp';
import tidalLeviathan from '../assets/demo/cards/tidal-leviathan.webp';
import coralSiren from '../assets/demo/cards/coral-siren.webp';
import stormDjinn from '../assets/demo/cards/storm-djinn.webp';
import galeFalcon from '../assets/demo/cards/gale-falcon.webp';
import gloomfang from '../assets/demo/cards/gloomfang.webp';
import netherMoth from '../assets/demo/cards/nether-moth.webp';
import obsidianGolem from '../assets/demo/cards/obsidian-golem.webp';
import auroraStag from '../assets/demo/cards/aurora-stag.webp';
import frostWyrm from '../assets/demo/cards/frost-wyrm.webp';
import verdantColossus from '../assets/demo/cards/verdant-colossus.webp';
import runeTortoise from '../assets/demo/cards/rune-tortoise.webp';
import lumenFox from '../assets/demo/cards/lumen-fox.webp';

export interface DemoVendor {
  id: string;
  name: string;
}

export interface DemoItem {
  id: string;
  vendorId: string;
  /** Bundled asset URL (import from src/assets/demo). */
  image: string;
  caption: string;
  /** width / height of the source image. */
  aspect: number;
  price?: number;
  status?: 'forSale' | 'sold' | 'display';
  condition?: string;
}

export interface DemoManifest {
  /** Bundled plan image URL — minimap + layout source. */
  planImage: string;
  planMeta: VendorPlanMeta;
  vendors: DemoVendor[];
  items: DemoItem[];
  /** Hall signage (F3) — proves the pipeline account-free. */
  signage?: HallSignageConfig;
}

const EMBER = 'demo-vendor-ember';
const NORTHSIDE = 'demo-vendor-northside';
const GRAIL = 'demo-vendor-grail';
const MINT = 'demo-vendor-mint';

/** All demo cards are 640×890 WebP renders. */
const CARD_ASPECT = 640 / 890;

/** Stable fake timestamps keep binder order = manifest order. */
const T0 = 1_752_000_000_000;

export const demoManifest: DemoManifest = {
  planImage: planImageUrl,
  planMeta: {
    // Real detection output on floorplan_example.png (1048×644, 50 boxes,
    // inferred 6-ft scale). Coordinates are stored-image pixels; the bundled
    // WebP re-encode keeps the identical pixel dimensions.
    pxPerMeter: 41.36842105263158,
    pxPerMeterSource: 'inferred',
    imgW: 1048,
    imgH: 644,
    updatedAt: 1752000000000,
    // Bottom-center aisle, just north of the entrance booth row.
    startPx: { x: 540, y: 560 },
    rects: [
      { id: '06de6ff7-c029-4677-9509-95a364fd6166', x: 375, y: 38, w: 149, h: 30 },
      { id: 'e022339d-937c-47b2-b0bb-7432019713d9', x: 722, y: 38, w: 149, h: 30 },
      { id: 'e1d9c7ad-ab8d-47b5-a49a-215ca890cac6', x: 881, y: 38, w: 48, h: 29 },
      { id: '33939e96-8c85-4f83-8d92-f5919f70cf7e', x: 276, y: 39, w: 89, h: 28 },
      { id: '9d033de9-8a75-4ab7-9a1f-56cbb2e18d19', x: 576, y: 39, w: 47, h: 29 },
      { id: 'a43c485c-5479-4bc0-b682-21291bb6f094', x: 663, y: 39, w: 48, h: 29 },
      { id: 'f88cab74-94c6-4b75-b962-cb15c780d50a', x: 992, y: 78, w: 32, h: 230 },
      { id: '241712f6-f6ec-4835-9e6f-0be34c5d076e', x: 233, y: 116, w: 31, h: 58 },
      { id: '752faf55-5161-44a4-813a-e94e56a37b7a', x: 370, y: 136, w: 31, h: 78 },
      { id: '745a94b6-03f1-4bae-ac94-7d0e383f9bce', x: 412, y: 136, w: 32, h: 31 },
      { id: '1c40c236-4258-43a1-98b1-89037325a231', x: 523, y: 138, w: 77, h: 83, vendorId: GRAIL },
      { id: '22116a52-9943-4536-89fd-e5664e9bda96', x: 675, y: 138, w: 32, h: 46 },
      { id: '4c0410a3-1df3-47e6-a2a0-b0b77ee587cd', x: 718, y: 139, w: 32, h: 45 },
      { id: 'c4ec18fc-49b7-440c-af32-ac1e4969a7d5', x: 805, y: 140, w: 31, h: 35 },
      { id: '86cc9eed-41af-40b3-934e-049a00dc166f', x: 848, y: 140, w: 32, h: 176 },
      { id: '754b9bf1-0c95-4b32-9385-5647f8083a01', x: 412, y: 182, w: 32, h: 31 },
      { id: '098bf3a6-0645-45b3-a966-1c2f924062ae', x: 233, y: 185, w: 31, h: 44 },
      { id: '89bcec54-3478-43eb-8368-16441d2f868a', x: 805, y: 189, w: 31, h: 38 },
      { id: '28c8950b-8c3a-47fb-95a1-60086019799f', x: 675, y: 194, w: 32, h: 36 },
      { id: 'ddd08fca-3045-4b1c-be84-183c2f9ec767', x: 718, y: 196, w: 32, h: 121 },
      { id: 'eb7408e5-917b-4335-aca0-af4126828f68', x: 371, y: 223, w: 31, h: 279 },
      { id: 'b9c75f07-b62c-4ec5-bbe3-9d966c9461d1', x: 412, y: 223, w: 32, h: 52 },
      { id: '4708c353-46df-47bd-819e-bec2c1b31a41', x: 675, y: 228, w: 32, h: 16 },
      { id: 'f0ba0839-b17e-4497-b366-4e44f6fe10fd', x: 525, y: 232, w: 31, h: 48 },
      { id: 'da10b016-e90e-4143-b3a8-c6a52adeec66', x: 567, y: 232, w: 32, h: 86 },
      { id: '9317d349-9fa3-4d02-9ef0-acfb04ddbade', x: 805, y: 235, w: 32, h: 31 },
      { id: 'd1ab8b02-6941-436d-8bd7-eb0bd5156ee5', x: 234, y: 241, w: 31, h: 113, vendorId: MINT },
      { id: '1c10ffb9-e79d-4299-8c0b-1338a13ebe98', x: 676, y: 254, w: 31, h: 81 },
      { id: 'db86b79c-616a-4285-9066-f130c23bbb2a', x: 805, y: 279, w: 32, h: 39 },
      { id: '6883e5b3-50e4-435b-9ec3-29928350ede6', x: 525, y: 281, w: 31, h: 36 },
      { id: '374159d3-f6bb-4620-a4e9-88c9b29edcfa', x: 412, y: 285, w: 32, h: 50 },
      { id: 'f2065e37-198a-4194-a571-eb573da7311b', x: 994, y: 318, w: 32, h: 217 },
      { id: '1300eac0-6437-4511-9c52-17ee941efb55', x: 525, y: 326, w: 32, h: 50 },
      { id: 'd21f5b7f-1d93-49c8-919e-ad59ba2f59b6', x: 568, y: 326, w: 31, h: 84 },
      { id: 'bce68661-aebc-4854-bf85-87b85ca864be', x: 718, y: 326, w: 32, h: 51 },
      { id: 'b6350d48-4b4a-4d5b-b334-d2d43ea5a9f1', x: 804, y: 328, w: 32, h: 50 },
      { id: '0dc56fbb-b965-4b82-a6d1-1dde44301a11', x: 676, y: 343, w: 31, h: 159 },
      { id: '3f8e6dae-2227-4cfc-ba3a-83593ca63dc4', x: 412, y: 345, w: 32, h: 157 },
      { id: 'e5141218-7652-449e-8f30-60b9cb29cd5c', x: 849, y: 359, w: 32, h: 19 },
      { id: '8b341435-49ba-4193-a024-45cdce399e35', x: 122, y: 364, w: 31, h: 78 },
      { id: 'd9b3203c-c280-49b3-902f-c6768439a570', x: 233, y: 366, w: 32, h: 74 },
      { id: '97169ba7-ca54-4eea-a9a8-e28964fe47ed', x: 525, y: 387, w: 32, h: 115 },
      { id: '588c07ff-6c7b-44a0-8e98-c24389c145a4', x: 718, y: 388, w: 31, h: 115 },
      { id: 'df80a2d9-1501-4da9-99b3-3e845bf18324', x: 804, y: 389, w: 32, h: 115 },
      { id: 'a23e4c4d-ba77-4d1f-ab0e-9385d8694c66', x: 849, y: 389, w: 31, h: 115 },
      { id: '5f6340a7-c5b5-4d2b-8105-ac23683449af', x: 568, y: 419, w: 31, h: 83 },
      { id: '251bee68-0b61-474c-833a-ca8d91c31043', x: 690, y: 593, w: 90, h: 31, vendorId: MINT },
      { id: 'f548db1e-4867-407d-804b-b09cb1b81a0a', x: 792, y: 593, w: 126, h: 31, vendorId: GRAIL },
      { id: '3d1d5109-8c54-428c-9b7b-3d0919f5d6b9', x: 449, y: 594, w: 63, h: 31, vendorId: EMBER },
      { id: '59fe5d0b-ef3c-4a27-beb2-19b9122c8c3a', x: 576, y: 594, w: 62, h: 31, vendorId: NORTHSIDE },
    ],
  },
  vendors: [
    { id: EMBER, name: 'Ember & Holo Cards' },
    { id: NORTHSIDE, name: 'Northside Breaks' },
    { id: GRAIL, name: 'Grail Case Collectibles' },
    { id: MINT, name: 'Mint Condition Co.' },
  ],
  items: [
    // Ember & Holo Cards — entrance row, left of the spawn aisle.
    { id: 'demo-item-emberdrake', vendorId: EMBER, image: emberdrake, aspect: CARD_ASPECT,
      caption: 'Emberdrake — Mythic Menagerie holo', price: 120, status: 'forSale', condition: 'PSA 9' },
    { id: 'demo-item-cinder-imp', vendorId: EMBER, image: cinderImp, aspect: CARD_ASPECT,
      caption: 'Cinder Imp — playset staple', price: 15, status: 'forSale', condition: 'raw' },
    { id: 'demo-item-solar-gryphon', vendorId: EMBER, image: solarGryphon, aspect: CARD_ASPECT,
      caption: 'Solar Gryphon — Dawn Choir chase card', price: 95, status: 'forSale', condition: 'PSA 8' },
    { id: 'demo-item-duskwing', vendorId: EMBER, image: duskwingSerpent, aspect: CARD_ASPECT,
      caption: 'Duskwing Serpent — binder fresh', price: 45, status: 'forSale', condition: 'NM' },
    // Northside Breaks — entrance row, right of the spawn aisle.
    { id: 'demo-item-leviathan', vendorId: NORTHSIDE, image: tidalLeviathan, aspect: CARD_ASPECT,
      caption: 'Tidal Leviathan — case hit from last night’s break', price: 240, status: 'forSale', condition: 'PSA 10' },
    { id: 'demo-item-coral-siren', vendorId: NORTHSIDE, image: coralSiren, aspect: CARD_ASPECT,
      caption: 'Coral Siren — Drowned Court alt art', price: 30, status: 'forSale', condition: 'raw' },
    { id: 'demo-item-storm-djinn', vendorId: NORTHSIDE, image: stormDjinn, aspect: CARD_ASPECT,
      caption: 'Storm Djinn — High Winds rare', price: 75, status: 'forSale', condition: 'PSA 8' },
    { id: 'demo-item-gale-falcon', vendorId: NORTHSIDE, image: galeFalcon, aspect: CARD_ASPECT,
      caption: 'Gale Falcon — budget flyer', price: 22, status: 'forSale', condition: 'NM' },
    // Grail Case Collectibles — big center booth + entrance-row double.
    { id: 'demo-item-gloomfang', vendorId: GRAIL, image: gloomfang, aspect: CARD_ASPECT,
      caption: 'Gloomfang — first printing', price: 180, status: 'sold', condition: 'PSA 8' },
    { id: 'demo-item-aurora-stag', vendorId: GRAIL, image: auroraStag, aspect: CARD_ASPECT,
      caption: 'Aurora Stag — the shop grail', price: 450, status: 'forSale', condition: 'PSA 10' },
    { id: 'demo-item-nether-moth', vendorId: GRAIL, image: netherMoth, aspect: CARD_ASPECT,
      caption: 'Nether Moth — Gloaming uncommon', price: 35, status: 'forSale', condition: 'raw' },
    { id: 'demo-item-obsidian-golem', vendorId: GRAIL, image: obsidianGolem, aspect: CARD_ASPECT,
      caption: 'Obsidian Golem — founders’ relic, display only', status: 'display' },
    // Mint Condition Co. — west wall booth + entrance-row table.
    { id: 'demo-item-frost-wyrm', vendorId: MINT, image: frostWyrm, aspect: CARD_ASPECT,
      caption: 'Frost Wyrm — Polar Crown holo', price: 60, status: 'forSale', condition: 'NM' },
    { id: 'demo-item-verdant', vendorId: MINT, image: verdantColossus, aspect: CARD_ASPECT,
      caption: 'Verdant Colossus — Old Growth stampede', price: 110, status: 'forSale', condition: 'PSA 9' },
    { id: 'demo-item-lumen-fox', vendorId: MINT, image: lumenFox, aspect: CARD_ASPECT,
      caption: 'Lumen Fox — Dawn Choir holo', price: 28, status: 'forSale', condition: 'raw' },
    { id: 'demo-item-rune-tortoise', vendorId: MINT, image: runeTortoise, aspect: CARD_ASPECT,
      caption: 'Rune Tortoise — slow and inevitable', price: 18, status: 'forSale', condition: 'LP' },
  ],
  // Organizer signage (F3) — a custom title + non-default theme proves the
  // pipeline end-to-end, account-free: title on the header AND the entrance
  // sign, subtitle words on the hanging banners, crimson pennant strings.
  signage: {
    title: 'EMBERVALE CARD EXPO',
    subtitle: 'BUY · SELL · TRADE',
    theme: 'crimson',
  },
};

/** The manifest's vendors as the VendorSummary shape VendorScene consumes
 *  (no banners — the hall letters each name onto the tablecloth drape). */
export function demoVendorSummaries(): VendorSummary[] {
  return demoManifest.vendors.map((v) => ({
    id: v.id,
    name: v.name,
    bannerUrl: null,
    inventoryCount: demoManifest.items.filter((i) => i.vendorId === v.id).length,
    manualShows: [],
    createdAt: T0,
    updatedAt: T0,
  }));
}

/** Bundled asset URLs → Blobs shaped like InventoryItemRecord, so the hall
 *  binders (sleeve textures, placards, captions) run exactly as they do for
 *  a published show. */
export async function fetchDemoInventory(vendorId: string): Promise<InventoryItemRecord[]> {
  const items = demoManifest.items.filter((i) => i.vendorId === vendorId);
  const records = await Promise.all(
    items.map(async (item, idx): Promise<InventoryItemRecord | null> => {
      try {
        const imageBlob = await (await fetch(item.image)).blob();
        return {
          id: item.id,
          vendorId: item.vendorId,
          imageBlob,
          caption: item.caption,
          visible: true,
          aspect: item.aspect,
          addedAt: T0 + idx * 1000,
          ...(item.price !== undefined ? { price: item.price } : {}),
          ...(item.status !== undefined ? { status: item.status } : {}),
          ...(item.condition !== undefined ? { condition: item.condition } : {}),
        };
      } catch {
        return null; // a missing asset shouldn't sink the whole binder
      }
    }),
  );
  return records.filter((r): r is InventoryItemRecord => r !== null);
}
