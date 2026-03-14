import { ProjectList } from "./ProjectList";
import { ChartList } from "./ChartList";
import { SourceMaterialList } from "./SourceMaterialList";
import { RevisionList } from "./RevisionList";

export function SidebarPane() {
  return (
    <div className="h-full flex flex-col bg-zinc-900 border-r border-zinc-800 overflow-y-auto">
      <div className="px-3 py-2 border-b border-zinc-800">
        <h1 className="text-sm font-bold text-zinc-200">AI Charts</h1>
      </div>
      <ProjectList />
      <ChartList />
      <SourceMaterialList />
      <RevisionList />
    </div>
  );
}
