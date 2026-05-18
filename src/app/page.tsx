import BubbleGrid from "@/components/BubbleGrid";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-semibold text-neutral-800 tracking-tight">
          Bubble Grid
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Gooey merged bubbles — use +/- to resize
        </p>
      </div>
      <BubbleGrid />
    </main>
  );
}
