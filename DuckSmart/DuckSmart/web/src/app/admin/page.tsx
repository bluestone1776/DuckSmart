"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getAllUsers } from "@/lib/firestore";
import { formatDateTime } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/ui/StatCard";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Users, Crown, Smartphone } from "lucide-react";
import type { UserProfile } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const data = await getAllUsers();
        setUsers(data);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const filteredUsers = search.trim()
    ? users.filter(
        (u) =>
          (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
          (u.displayName || "").toLowerCase().includes(search.toLowerCase()) ||
          (u.uid || "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const proCount = users.filter((u) => u.isPro).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white font-black text-2xl">Users</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-white font-black text-2xl">Users</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Users"
          value={users.length}
          color="white"
          icon={<Users size={18} />}
        />
        <StatCard
          label="Pro Users"
          value={proCount}
          color="green"
          icon={<Crown size={18} />}
        />
        <StatCard
          label="Free Users"
          value={users.length - proCount}
          color="yellow"
          icon={<Users size={18} />}
        />
      </div>

      {/* Search */}
      <Input
        placeholder="Search by name, email, or UID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* User list */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon="👤"
          title="No users found"
          description={users.length === 0 ? "No users have signed up yet." : "No users match your search."}
        />
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => (
            <Card key={u.uid} className="hover:border-[#D9A84C]/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#0E0E0E] border border-[#3A3A3A] flex items-center justify-center flex-shrink-0">
                    {u.photoURL ? (
                      <Image
                        src={u.photoURL}
                        alt={`${u.displayName || "User"} avatar`}
                        width={40}
                        height={40}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-[#8E8E8E] font-black text-sm">
                        {(u.displayName || u.email || "?")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm truncate">
                      {u.displayName || "No Name"}
                    </p>
                    <p className="text-[#8E8E8E] font-bold text-xs truncate">
                      {u.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {u.isPro && <Badge label="PRO" color="green" />}
                      <Badge label={u.authProvider || "email"} color="yellow" />
                      {u.device && (
                        <span className="text-[#6D6D6D] text-[10px] font-bold flex items-center gap-1">
                          <Smartphone size={10} />
                          {u.device.platform}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-[#6D6D6D] font-bold text-[10px] uppercase">Last Login</p>
                  <p className="text-[#8E8E8E] font-bold text-xs">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "N/A"}
                  </p>
                  <p className="text-[#6D6D6D] font-bold text-[10px] uppercase mt-1">Joined</p>
                  <p className="text-[#8E8E8E] font-bold text-xs">
                    {u.createdAt ? formatDateTime(u.createdAt) : "N/A"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
