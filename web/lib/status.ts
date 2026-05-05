export const statusBadge: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  running: { label: "Running", className: "bg-indigo-100 text-indigo-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  aborted: { label: "Aborted", className: "bg-amber-100 text-amber-700" },
  waiting: { label: "Waiting", className: "bg-purple-100 text-purple-700" },
};
