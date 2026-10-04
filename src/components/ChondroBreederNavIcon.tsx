type NavIconId = "home" | "breeding" | "colony" | "clutches" | "market";

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="13" strokeWidth="1.7" opacity=".28" />
      <path d="M7.2 24.2c3.4 2.5 6.5 3.2 8.8 3.2 2.6 0 5.8-.8 8.9-3.3" strokeWidth="1.4" opacity=".38" />
      {children}
    </svg>
  );
}

export function ChondroBreederNavIcon({ id, className = "h-7 w-7" }: { id: NavIconId; className?: string }) {
  if (id === "home") {
    return <Badge className={className}><path d="M8.7 15.4 16 9l7.3 6.4v8.2H18v-5h-4v5H8.7v-8.2Z" strokeWidth="2.5" /><path d="M21.3 10.2c2-1.7 3.5-1.5 4.4-.9-.1 2.4-1.3 3.8-3.8 4.1" strokeWidth="1.9" /></Badge>;
  }
  if (id === "breeding") {
    return <Badge className={className}><path d="M7.6 12.5c3.6-3.5 7.1-1.3 8.4 1.2 1.3-2.5 4.8-4.7 8.4-1.2 3.6 3.5-.2 7.5-8.4 12.2-8.2-4.7-12-8.7-8.4-12.2Z" strokeWidth="2.35" /><path d="M11.3 14.1c1.7-.6 3.3.1 4.7 1.6 1.4-1.5 3-2.2 4.7-1.6" strokeWidth="1.7" /></Badge>;
  }
  if (id === "colony") {
    return <Badge className={className}><path d="M23.5 10.2c-4.4-2.8-10.8-.7-11.4 3-.4 2.6 2.2 4.4 5.2 3.4 3.9-1.3 6.9.6 6 3.6-1 3.3-6.4 4.5-10.6 2.4-2.4-1.2-4-3.1-4.3-5.2" strokeWidth="2.55" /><path d="M22.7 10.1c1.6.5 2.3 1.5 2.4 2.8-1.5.4-2.7.1-3.6-.9" strokeWidth="1.8" /><circle cx="22.2" cy="10.4" r=".8" fill="currentColor" stroke="none" /></Badge>;
  }
  if (id === "clutches") {
    return <Badge className={className}><path d="M12.4 10.2c-2.4 2.9-4 6-4 8.7 0 3.1 1.8 5.2 4.5 5.2 2.8 0 4.7-2.2 4.7-5.3 0-2.8-2.3-6.4-5.2-8.6Z" strokeWidth="2.15" /><path d="M20.3 12.4c-2 2.5-3.3 5.2-3.3 7.5 0 2.7 1.5 4.5 3.9 4.5 2.4 0 4-1.9 4-4.6 0-2.4-2-5.5-4.6-7.4Z" strokeWidth="2.15" /><path d="M9.4 8.8c1.8-1.2 3.5-1.5 5.2-.8" strokeWidth="1.5" opacity=".55" /></Badge>;
  }
  return <Badge className={className}><path d="M8.2 13.2h15.6l-1.1-4H9.3l-1.1 4Z" strokeWidth="2.3" /><path d="M9.5 14v9.6h13V14" strokeWidth="2.3" /><path d="M13.1 23.5v-5.7h5.8v5.7" strokeWidth="2.1" /><path d="M7.5 13.1c0 1.8 1.2 3 2.7 3 1.2 0 2.1-.6 2.6-1.6.5 1 1.5 1.6 2.7 1.6s2.2-.6 2.7-1.6c.5 1 1.4 1.6 2.6 1.6 1.5 0 2.7-1.2 2.7-3" strokeWidth="1.8" /></Badge>;
}
