import type { Metadata } from "next";
import { product } from "@/config/product";

export interface PageMetaInput {
  title: string;
  description: string;
  /** Path starting with a slash, for example "/docs/billing". */
  path: string;
  noindex?: boolean;
}

export function absoluteUrl(path: string): string {
  return new URL(path, product.url).toString();
}

/** Absolute product opengraph-image URL, for pages whose own openGraph would otherwise drop the file based image. */
export const socialImageUrl = () => absoluteUrl("/opengraph-image");
export const ogImages = () => [{ url: socialImageUrl(), width: 1200, height: 630 }];
export const twitterImages = () => [socialImageUrl()];

export function pageMetadata({ title, description, path, noindex }: PageMetaInput): Metadata {
  const url = absoluteUrl(path);
  const full = `${title} · ${product.fullName}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: product.fullName, title: full, description, url, images: ogImages() },
    twitter: { card: "summary_large_image", title: full, description, images: twitterImages() },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
