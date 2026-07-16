import { Prisma } from '@prisma/client';

export function buildMapsUrlFromSnapshot(
  snapshot: Prisma.JsonValue | null | undefined,
): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const latitude = record.latitude;
  const longitude = record.longitude;

  if (latitude == null || longitude == null) {
    return null;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function withOrderMapsUrl<T extends { addressSnapshot: Prisma.JsonValue | null }>(
  order: T,
): T & { mapsUrl: string | null } {
  return {
    ...order,
    mapsUrl: buildMapsUrlFromSnapshot(order.addressSnapshot),
  };
}
