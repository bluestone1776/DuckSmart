"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { getUserProfile } from "@/lib/firestore";
import { logout } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { LogOut, Shield, User, Smartphone, MapPin, Calendar } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { UserProfile } from "@/lib/types";

export default function SettingsPage() {
  const { user } = useAuth();
  const { role, isAdmin } = useRole();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    async function fetchProfile() {
      try {
        const data = await getUserProfile(user!.uid);
        if (!cancelled) setProfile(data);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-white font-black text-2xl">Settings</h1>
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-white font-black text-2xl">Settings</h1>

      {/* Account Card */}
      <Card title="Account">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0E1A12] border-2 border-[#2ECC71] flex items-center justify-center">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User size={24} className="text-[#2ECC71]" />
              )}
            </div>
            <div>
              <p className="text-white font-black text-sm">
                {user?.displayName || profile?.displayName || "Hunter"}
              </p>
              <p className="text-[#8E8E8E] font-bold text-xs">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                {profile?.isPro && <Badge label="PRO" color="green" />}
                {isAdmin && <Badge label="ADMIN" color="yellow" />}
                <Badge
                  label={profile?.authProvider || "email"}
                  color="green"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Details */}
      {profile && (
        <Card title="Profile Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} />
                Member Since
              </p>
              <p className="text-[#BDBDBD] font-bold text-sm">
                {profile.createdAt ? formatDateTime(profile.createdAt) : "N/A"}
              </p>
            </div>

            <div>
              <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} />
                Last Login
              </p>
              <p className="text-[#BDBDBD] font-bold text-sm">
                {profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "N/A"}
              </p>
            </div>

            {profile.lastKnownLocation && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1 flex items-center gap-1">
                  <MapPin size={12} />
                  Last Known Location
                </p>
                <p className="text-[#BDBDBD] font-bold text-sm">
                  {profile.lastKnownLocation.lat.toFixed(4)},{" "}
                  {profile.lastKnownLocation.lng.toFixed(4)}
                </p>
              </div>
            )}

            {profile.device && (
              <div>
                <p className="text-[#6D6D6D] font-bold text-xs uppercase mb-1 flex items-center gap-1">
                  <Smartphone size={12} />
                  Device
                </p>
                <p className="text-[#BDBDBD] font-bold text-sm">
                  {profile.device.brand} {profile.device.model}
                </p>
                <p className="text-[#7A7A7A] font-bold text-xs">
                  {profile.device.platform} {profile.device.osVersion} • v
                  {profile.device.appVersion}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Role */}
      <Card title="Role & Permissions">
        <div className="flex items-center gap-3">
          <Shield size={18} className="text-[#8E8E8E]" />
          <div>
            <p className="text-white font-black text-sm capitalize">{role || "user"}</p>
            <p className="text-[#7A7A7A] font-bold text-xs">
              {isAdmin
                ? "You have admin access to the admin panel."
                : "Standard user account. Contact an admin for elevated permissions."}
            </p>
          </div>
        </div>
      </Card>

      {/* Subscription */}
      <Card title="Subscription">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-black text-sm">
              {profile?.isPro ? "DuckSmart Pro" : "Free Tier"}
            </p>
            <p className="text-[#7A7A7A] font-bold text-xs">
              {profile?.isPro
                ? "You have access to all Pro features."
                : "Upgrade to Pro in the mobile app for full species data and advanced features."}
            </p>
          </div>
          <Badge
            label={profile?.isPro ? "ACTIVE" : "FREE"}
            color={profile?.isPro ? "green" : "yellow"}
          />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleLogout}>
          <span className="flex items-center gap-2">
            <LogOut size={14} />
            Sign Out
          </span>
        </Button>
      </div>
    </div>
  );
}
