"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { logout, resendVerificationEmail, refreshCurrentUser } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import { LogOut, Menu, X, Mail } from "lucide-react";
import type { User } from "firebase/auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { isAdmin } = useRole();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="w-10 h-10 border-4 border-[#2ECC71] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Email/password users must verify their email
  const isEmailProvider = user.providerData?.some((p) => p.providerId === "password");
  if (isEmailProvider && !user.emailVerified) {
    return <VerifyEmailBanner user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar isAdmin={isAdmin} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10">
            <Sidebar isAdmin={isAdmin} />
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-[-48px] text-white bg-[#141414] border border-[#3A3A3A] rounded-full p-2 cursor-pointer hover:bg-[#1a1a1a]"
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-60">
        {/* Header */}
        <header className="h-16 bg-[#0A0A0A] border-b border-[#3A3A3A] flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-white cursor-pointer hover:opacity-70 transition-opacity"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <span className="font-black text-lg lg:hidden">
              <span className="text-white">Duck</span>
              <span className="text-[#2ECC71]">Smart</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[#8E8E8E] font-bold text-sm hidden sm:block">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-[#8E8E8E] hover:text-white transition-colors cursor-pointer font-bold text-sm"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Email verification gate (blocks dashboard for unverified email/password users)
// ---------------------------------------------------------------------------

function VerifyEmailBanner({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [resent, setResent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleResend() {
    setError("");
    setResent(false);
    try {
      await resendVerificationEmail();
      setResent(true);
    } catch (err: any) {
      setError(err.code === "auth/too-many-requests"
        ? "Verification email already sent. Please check your inbox or try again later."
        : "Failed to send verification email. Please try again."
      );
    }
  }

  async function handleCheck() {
    setChecking(true);
    setError("");
    try {
      const refreshed = await refreshCurrentUser();
      if (refreshed?.emailVerified) {
        router.refresh();
      } else {
        setError("Email not verified yet. Please check your inbox and click the verification link.");
      }
    } catch {
      setError("Failed to check verification status.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#0E1A12] border border-[#2ECC71] flex items-center justify-center">
            <Mail size={28} className="text-[#2ECC71]" />
          </div>
        </div>
        <h1 className="text-white font-black text-2xl mb-2">Verify Your Email</h1>
        <p className="text-[#8E8E8E] font-bold text-sm mb-2">We sent a verification link to:</p>
        <p className="text-[#2ECC71] font-black text-base mb-6">{user.email}</p>
        <p className="text-[#6D6D6D] font-bold text-sm mb-8 leading-relaxed">
          Please check your inbox (and spam folder) and click the link to verify your email address.
        </p>

        {error && (
          <div className="bg-[rgba(217,76,76,0.12)] border border-[#D94C4C] rounded-[14px] px-4 py-3 mb-4">
            <p className="text-[#D94C4C] font-bold text-sm">{error}</p>
          </div>
        )}

        {resent && (
          <p className="text-[#2ECC71] font-bold text-sm mb-4">Verification email sent!</p>
        )}

        <button
          onClick={handleCheck}
          disabled={checking}
          className="w-full py-3.5 rounded-[14px] bg-[#0E1A12] border border-[#2ECC71] text-[#2ECC71] font-black text-sm hover:brightness-125 transition-all cursor-pointer disabled:opacity-50 mb-3"
        >
          {checking ? "Checking..." : "I've Verified — Continue"}
        </button>

        <button
          onClick={handleResend}
          className="w-full py-3.5 rounded-[14px] bg-[#0E0E0E] border border-[#3A3A3A] text-white font-black text-sm hover:brightness-125 transition-all cursor-pointer mb-3"
        >
          Resend Verification Email
        </button>

        <button
          onClick={onLogout}
          className="text-[#8E8E8E] font-bold text-sm hover:text-white transition-colors cursor-pointer mt-2"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
