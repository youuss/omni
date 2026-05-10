export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted-foreground/20 border-t-foreground/60" />
    </div>
  );
}
