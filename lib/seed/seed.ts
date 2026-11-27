import { and, eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import {
  events,
  inventory,
  organizations,
  platformAdmins,
  priceWaves,
  ticketTypes,
  users,
  venues,
} from "@/lib/db/schema";
import type { AnyDb } from "@/lib/db/types";

export type SeedInput = {
  adminAuthUserId: string;
  adminEmail: string;
  /** Pro testy; výchozí je aktuální čas. */
  now?: Date;
};

export type SeedCounts = {
  users: number;
  platformAdmins: number;
  organizations: number;
  venues: number;
  events: number;
  ticketTypes: number;
  priceWaves: number;
  inventory: number;
};

export const SEED_ORG_SLUG = "3lwave";
export const SEED_EVENT_SLUG = "ukazkova-akce";

const DAY_MS = 24 * 60 * 60 * 1000;
const TICKET_CAPACITY = 500;

/**
 * Idempotentní seed: platform admin + organizace 3Lwave s ukázkovou akcí.
 * Existující data se nikdy nepřepisují (údaje organizace se po seedu upravují v adminu).
 * Vrací, kolik řádků tento běh nově vytvořil (při opakování samé nuly).
 * Admin NENÍ členem organizace: platform admin vidí všechny organizace přes guard.
 */
export async function runSeed(db: AnyDb, input: SeedInput): Promise<SeedCounts> {
  const now = input.now ?? new Date();
  const email = input.adminEmail.trim().toLowerCase();
  const counts: SeedCounts = {
    users: 0,
    platformAdmins: 0,
    organizations: 0,
    venues: 0,
    events: 0,
    ticketTypes: 0,
    priceWaves: 0,
    inventory: 0,
  };

  await db.transaction(async (tx) => {
    const insertedUser = await tx
      .insert(users)
      .values({ id: input.adminAuthUserId, email })
      .onConflictDoNothing()
      .returning({ id: users.id });
    counts.users = insertedUser.length;

    const insertedAdmin = await tx
      .insert(platformAdmins)
      .values({ userId: input.adminAuthUserId })
      .onConflictDoNothing()
      .returning({ userId: platformAdmins.userId });
    counts.platformAdmins = insertedAdmin.length;

    // --- organizace
    const insertedOrg = await tx
      .insert(organizations)
      .values({
        slug: SEED_ORG_SLUG,
        name: "3Lwave",
        legalName: "Globaal Elevate Production s.r.o.",
        ico: "24972070",
        dic: "CZ24972070",
        // placeholder adresa: Luigi ji upraví v adminu
        street: "Ulice 1",
        city: "Praha",
        zip: "110 00",
        country: "CZ",
        vatPayer: true,
        invoicePrefix: "3LW",
        feeBps: 500,
        feeFixed: 0,
      })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({ id: organizations.id });
    counts.organizations = insertedOrg.length;

    const [org] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, SEED_ORG_SLUG))
      .limit(1);
    if (!org) throw new Error("seed: organizace nebyla nalezena");

    if (insertedOrg[0]) {
      await recordAudit(tx, {
        actorId: null,
        organizationId: org.id,
        action: "seed",
        entity: "organization",
        entityId: org.id,
        diff: { slug: SEED_ORG_SLUG },
      });
    }

    // --- venue (bez unikátu: existence-check)
    const venueName = "Ukázkové místo (placeholder)";
    let [venue] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.organizationId, org.id), eq(venues.name, venueName)))
      .limit(1);
    if (!venue) {
      [venue] = await tx
        .insert(venues)
        .values({
          organizationId: org.id,
          name: venueName,
          address: "Praha",
          capacity: TICKET_CAPACITY,
        })
        .returning({ id: venues.id });
      counts.venues = 1;
    }
    if (!venue) throw new Error("seed: venue nebylo vytvořeno");

    // --- akce (unikát organization_id + slug)
    const insertedEvent = await tx
      .insert(events)
      .values({
        organizationId: org.id,
        venueId: venue.id,
        slug: SEED_EVENT_SLUG,
        name: "Ukázková akce",
        description: "Ukázková akce ze seedu. Smaž nebo uprav v adminu.",
        startsAt: new Date(now.getTime() + 90 * DAY_MS),
        status: "draft",
        totalCapacity: TICKET_CAPACITY,
      })
      .onConflictDoNothing({ target: [events.organizationId, events.slug] })
      .returning({ id: events.id });
    counts.events = insertedEvent.length;

    const [event] = await tx
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.organizationId, org.id), eq(events.slug, SEED_EVENT_SLUG)))
      .limit(1);
    if (!event) throw new Error("seed: akce nebyla nalezena");

    // --- typ vstupenky (existence-check na akci + název)
    const typeName = "Vstupenka";
    let [type] = await tx
      .select({ id: ticketTypes.id, totalCapacity: ticketTypes.totalCapacity })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, event.id), eq(ticketTypes.name, typeName)))
      .limit(1);
    if (!type) {
      [type] = await tx
        .insert(ticketTypes)
        .values({
          eventId: event.id,
          organizationId: org.id,
          name: typeName,
          vatRateBps: 1200,
          totalCapacity: TICKET_CAPACITY,
        })
        .returning({ id: ticketTypes.id, totalCapacity: ticketTypes.totalCapacity });
      counts.ticketTypes = 1;
    }
    if (!type) throw new Error("seed: typ vstupenky nebyl vytvořen");

    // --- cenová vlna (existence-check na typ)
    const [wave] = await tx
      .select({ id: priceWaves.id })
      .from(priceWaves)
      .where(eq(priceWaves.ticketTypeId, type.id))
      .limit(1);
    if (!wave) {
      await tx.insert(priceWaves).values({ ticketTypeId: type.id, price: 59_900, startsAt: now });
      counts.priceWaves = 1;
    }

    // --- kapacita (PK ticket_type_id); sold/reserved se nikdy nepřepisují, patří lib/inventory
    const insertedInventory = await tx
      .insert(inventory)
      .values({ ticketTypeId: type.id, capacity: type.totalCapacity, sold: 0, reserved: 0 })
      .onConflictDoNothing()
      .returning({ ticketTypeId: inventory.ticketTypeId });
    counts.inventory = insertedInventory.length;
  });

  return counts;
}
