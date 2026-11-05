import type { MeterId } from "@/config/product";

/** Product-facing names for each meter. A new product edits this map. */
export const METER_LABELS: Record<MeterId, { singular: string; plural: string; period: string }> = {
  devices: { singular: "device", plural: "devices", period: "" },
  tenants: { singular: "tenant", plural: "tenants", period: "" },
  catalog_apps: { singular: "catalog app", plural: "catalog apps", period: "" },
  custom_apps: { singular: "Custom App", plural: "Custom Apps", period: "" },
};

export const METERS_SHOWN: MeterId[] = ["devices", "tenants", "custom_apps"];
export const fmt = (n: number) => new Intl.NumberFormat("en").format(n);
