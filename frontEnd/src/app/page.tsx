import Navbar from "@/components/NavBar";
import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <div className="w-[1920px] h-[1080px] flex flex-col">
      <div className="w-[1920px] h-11">
        <Navbar />
      </div>
      <div className="flex-1 overflow-hidden">
        <Dashboard />
      </div>
    </div>
  );
}
