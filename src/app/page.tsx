import BubbleGrid from "@/components/BubbleGrid";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-semibold text-neutral-800 tracking-tight">
          Bubble Grid
        </h1>
        
      </div>
      <BubbleGrid />
    </main>
  );
}
