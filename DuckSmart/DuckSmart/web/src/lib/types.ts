// ---------------------------------------------------------------------------
//  Firestore document interfaces for DuckSmart
// ---------------------------------------------------------------------------

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: string;
  createdAt: number;
  lastLoginAt: number;
  device: {
    platform: string;
    osVersion: string;
    appVersion: string;
    model: string;
    brand: string;
    manufacturer: string;
  };
  lastKnownLocation?: {
    lat: number;
    lng: number;
  };
  isPro: boolean;
}

export interface UserRole {
  role: "admin" | "user";
}

export interface HuntLog {
  id: string;
  createdAt: number;
  dateTime: string; // ISO 8601
  environment: string;
  spread: string;
  spreadDetails: {
    name: string;
    type: string;
    decoyCount: string;
    calling: string;
    bestTime: string;
    notes: string;
  } | null;
  huntScore: number; // 0-100
  ducksHarvested: number;
  notes: string;
  location: {
    latitude: number;
    longitude: number;
  };
  photos: {
    uri: string;
    width: number;
    height: number;
  }[];
  updatedAt?: number;
}

export interface MapPin {
  id: string;
  title: string;
  type: string;
  notes: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  createdAt: number;
  updatedAt?: number;
}

export interface AnalyticsEvent {
  eventName: string;
  userId: string;
  sessionId: string;
  timestamp: number;
  device: {
    platform: string;
    osVersion: string;
    appVersion: string;
    model: string;
    brand: string;
    manufacturer: string;
    isDevice: boolean;
  };
  metadata: Record<string, unknown>;
}

export interface FeedbackTicket {
  id: string;
  message: string;
  category: string;
  userId: string;
  email: string;
  platform: string;
  appVersion: string;
  createdAt: string; // ISO 8601
  timestamp: number;
  status: "pending" | "resolved";
}
