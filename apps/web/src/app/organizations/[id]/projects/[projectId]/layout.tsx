import { Suspense } from 'react';
import ProjectSidebarLayout from './project-sidebar';

export const instant = false;

export default function ProjectLayout({ children }: LayoutProps<'/organizations/[id]/projects/[projectId]'>) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <p className="text-zinc-500">Loading…</p>
        </div>
      }
    >
      <ProjectSidebarLayout>{children}</ProjectSidebarLayout>
    </Suspense>
  );
}
