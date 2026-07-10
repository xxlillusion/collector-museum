/**
 * Demo-show manifest seam (Wave A scaffold — Stream A1 authors the manifest
 * and bundled assets). The demo screen turns bundled image URLs into Blobs so
 * the hall's binder / sleeve-texture pipeline runs unchanged, and feeds
 * planMeta straight into planToLayout like any saved plan.
 */
import type { VendorPlanMeta } from './vendorPlan';

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
}
