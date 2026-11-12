import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 border-b-2 border-text pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="heading-5 md:heading-4 text-text">{title}</h1>
        {description ? <p className="body-6 text-text-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Titled block inside a page: a bordered panel with a header row and a body. */
export function Panel({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-raised">
      <div className="flex flex-col gap-2 bg-surface-sunken px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div className="flex max-w-xl flex-col gap-1">
          <h2 className="title-3 font-semibold text-text">{title}</h2>
          {description ? <p className="body-6 text-text-subtle">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="h-0.5 bg-text" aria-hidden />
      <div className="p-4 md:p-6">{children}</div>
    </section>
  );
}
