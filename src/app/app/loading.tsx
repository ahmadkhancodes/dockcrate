import { Skeleton } from "@/components/ui/states";

/** Skeleton shaped like the dock: header, tenant switcher, KPI strip, rows and the manifest panel. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-11 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-8">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="h-72 w-full lg:col-span-4" />
      </div>
    </div>
  );
}
