import { Skeleton } from "@/components/ui/states";

/** Skeleton shaped like the MSP page: header, KPI strip, filters and three tables. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the MSP dashboard" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
