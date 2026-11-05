import { graphDriver } from "@/lib/env";
import { FakeGraphFactory } from "./fake";
import { RealGraphFactory } from "./real";
import type { GraphFactory } from "./types";

export type { GraphClient, GraphFactory } from "./types";

declare global {
  var __dcFakeGraph: FakeGraphFactory | undefined;
}

/** Real Graph when Entra is configured, otherwise the in-memory fake (stub mode, previews, e2e). */
export function getGraphFactory(): GraphFactory {
  if (graphDriver() === "real") return new RealGraphFactory();
  return (globalThis.__dcFakeGraph ??= new FakeGraphFactory());
}
