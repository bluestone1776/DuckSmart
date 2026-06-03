"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  loginWithEmail,
  loginWithGoogle,
  loginWithApple,
  getRawAuthErrorMessage,
} from "@/lib/auth";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard/history");
    }
  }, [user, loading, router]);

  async function handleEmailLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      await loginWithEmail(email.trim(), password);
      router.push("/dashboard/history");
    } catch (err: unknown) {
      setError(getRawAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setSubmitting(true);

    try {
      await loginWithGoogle();
      router.push("/dashboard/history");
    } catch (err: unknown) {
      setError(getRawAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAppleLogin() {
    setError("");
    setSubmitting(true);

    try {
      await loginWithApple();
      router.push("/dashboard/history");
    } catch (err: unknown) {
      setError(getRawAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2ECC71] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-4">
      <div className="w-full max-w-md rounded-[18px] border border-[#3A3A3A] bg-[#141414] p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black">
            <span className="text-white">Duck</span>
            <span className="text-[#2ECC71]">Smart</span>
          </h1>
          <p className="mt-2 text-sm font-bold text-[#7A7A7A]">
            Sign in to your hunting dashboard
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-[14px] border border-[#D94C4C] bg-[rgba(217,76,76,0.12)] px-4 py-3">
            <p className="whitespace-pre-wrap text-sm font-bold text-[#D94C4C]">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="mt-2 w-full"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#3A3A3A]" />
          <span className="text-xs font-bold text-[#6D6D6D]">OR</span>
          <div className="h-px flex-1 bg-[#3A3A3A]" />
        </div>

        <Button
          variant="secondary"
          onClick={handleGoogleLogin}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </Button>

        <Button
          variant="secondary"
          onClick={handleAppleLogin}
          disabled={submitting}
          className="mt-3 flex w-full items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M15.1 6.05c-.09.07-1.68.97-1.68 2.96 0 2.31 2.03 3.13 2.09 3.15-.01.05-.32 1.12-1.07 2.21-.65.95-1.33 1.9-2.4 1.9s-1.32-.62-2.53-.62c-1.18 0-1.6.64-2.58.64s-1.63-.88-2.4-1.96C3.36 12.58 2.5 10.33 2.5 8.21c0-3.4 2.21-5.2 4.38-5.2 1.15 0 2.12.76 2.84.76.7 0 1.78-.8 3.1-.8.5 0 2.3.05 3.28 1.08zM11.19 1.98c.48-.57.82-1.36.82-2.15 0-.11-.01-.22-.03-.31-.78.03-1.71.52-2.27 1.17-.44.5-.85 1.3-.85 2.1 0 .12.02.24.03.28.05.01.14.02.22.02.7 0 1.59-.47 2.08-1.11z"
              fill="white"
            />
          </svg>
          Sign in with Apple
        </Button>
      </div>
    </div>
  );
}