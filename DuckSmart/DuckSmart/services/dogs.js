// services/dogs.js

import { collection, getDocs, doc, setDoc, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

const MAX_DOG_PHOTO_BYTES = 10 * 1024 * 1024;

function isRemoteUri(uri) {
  return typeof uri === "string" && /^https?:\/\//i.test(uri);
}

function getPhotoContentType(blob) {
  if (blob?.type && String(blob.type).startsWith("image/")) {
    return blob.type;
  }

  return "image/jpeg";
}

function cleanDog(dog) {
  if (!dog?.id) return null;

  const photo =
    dog.photoUri ||
    dog.photoUrl ||
    dog.photoURL ||
    dog.imageUri ||
    dog.imageUrl ||
    null;

  return {
    id: String(dog.id),
    name: String(dog.name || ""),
    breed: String(dog.breed || ""),
    birthday: String(dog.birthday || ""),
    age: String(dog.age || ""),
    sex: String(dog.sex || ""),
    notes: String(dog.notes || ""),
    photoUri: photo,
    photoUrl: photo,
    photoURL: photo,
    active: dog.active !== false,
    deletedAt: dog.deletedAt || null,
    createdAt: dog.createdAt || Date.now(),
    updatedAt: dog.updatedAt || Date.now(),
  };
}

export async function loadDogsFromFirebase(uid) {
  if (!uid) return [];

  const snap = await getDocs(collection(db, "users", uid, "dogs"));

  return snap.docs
    .map((d) => cleanDog({ id: d.id, ...d.data() }))
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function saveDogToFirebase(uid, dog) {
  if (!uid || !dog?.id) return;

  const cleaned = cleanDog(dog);
  if (!cleaned) return;

  await setDoc(doc(db, "users", uid, "dogs", cleaned.id), cleaned, {
    merge: true,
  });
}

export async function saveDogsToFirebase(uid, dogs = []) {
  if (!uid || !Array.isArray(dogs)) return;

  const cleanedDogs = dogs.map(cleanDog).filter((dog) => dog?.id);

  if (!cleanedDogs.length) return;

  const batch = writeBatch(db);

  cleanedDogs.forEach((dog) => {
    batch.set(doc(db, "users", uid, "dogs", dog.id), dog, {
      merge: true,
    });
  });

  await batch.commit();
}

export async function uploadDogPhotoToFirebase({ uid, dogId, sourceUri }) {
  if (!uid || !dogId || !sourceUri) return null;

  if (isRemoteUri(sourceUri)) return sourceUri;

  const response = await fetch(sourceUri);
  const blob = await response.blob();

  if (blob.size > MAX_DOG_PHOTO_BYTES) {
    throw new Error("Dog photo must be under 10 MB.");
  }

  const contentType = getPhotoContentType(blob);
  const photoRef = ref(storage, `users/${uid}/dog-photos/${dogId}/profile.jpg`);

  await uploadBytes(photoRef, blob, {
    contentType,
  });

  return await getDownloadURL(photoRef);
}