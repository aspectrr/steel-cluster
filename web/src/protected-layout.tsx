import { Outlet } from "react-router-dom";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/toaster";
import PostHogPageView from "./components/page-view";

export default function ProtectedLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden max-h-screen items-center justify-center flex-1 bg-background-0 text-[var(--sand-12)]">
      <Header />
      <div className="flex flex-col overflow-hidden flex-1 w-full">
        <Outlet />
      </div>
      <Toaster />
      <PostHogPageView />
    </div>
  );
}
