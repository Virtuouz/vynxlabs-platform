import { defineScript, z } from "@vynxlabs/sdk";
import { type Reason, TIME_ZONE, VISIT_MINUTES } from "./constants.ts";
import {
  appointments,
  clients,
  clinics,
  inventory,
  invoices,
  pets,
  purchaseOrders,
  registrations,
} from "./model.ts";
import { hoursOn, instantAt, wallClock } from "./time.ts";

/** The same numbers every time, so two workspaces seeded alike look alike. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLINIC_ROWS = [
  {
    code: "northside",
    name: "Fernhill Northside",
    phone: "(503) 555-0101",
    address: "4815 NE 33rd Ave, Portland, OR 97211",
    opens: "08:00",
    closes: "18:00",
    saturday_closes: "12:00",
  },
  {
    code: "riverside",
    name: "Fernhill Riverside",
    phone: "(503) 555-0102",
    address: "1220 SE Water Ave, Portland, OR 97214",
    opens: "08:30",
    closes: "18:30",
    saturday_closes: "12:30",
  },
  {
    code: "hilltop",
    name: "Fernhill Hilltop",
    phone: "(503) 555-0103",
    address: "3075 SW Council Crest Dr, Portland, OR 97239",
    opens: "09:00",
    closes: "17:00",
    saturday_closes: null,
  },
];
const VETS: Record<string, string[]> = {
  northside: ["Dr. Amara Okafor", "Dr. Tom Hale"],
  riverside: ["Dr. Priya Raman", "Dr. Leo Marsh"],
  hilltop: ["Dr. Hannah Cole", "Dr. Sam Ortiz"],
};
const FIRST = [
  "Olivia",
  "Noah",
  "Amelia",
  "George",
  "Isla",
  "Arthur",
  "Ava",
  "Leo",
  "Mia",
  "Oscar",
  "Freya",
  "Harry",
  "Lily",
  "Jack",
  "Grace",
  "Theo",
  "Ella",
  "Finley",
  "Ruby",
  "Alfie",
  "Sophie",
  "Ibrahim",
  "Chloe",
  "Mohammed",
  "Zara",
  "Ethan",
  "Aisha",
  "Lucas",
  "Maya",
  "Rhys",
];
const LAST = [
  "Patel",
  "Jones",
  "Williams",
  "Taylor",
  "Brown",
  "Davies",
  "Evans",
  "Wilson",
  "Thomas",
  "Roberts",
  "Johnson",
  "Lewis",
  "Walker",
  "Robinson",
  "Wood",
  "Thompson",
  "White",
  "Hughes",
  "Edwards",
  "Green",
  "Khan",
  "Hall",
  "Clarke",
  "Jackson",
  "Ahmed",
  "Murphy",
  "Okoye",
  "Nguyen",
  "Kowalski",
  "Byrne",
];
const PETS: { species: string; names: string[]; breeds: string[]; weight: [number, number] }[] = [
  {
    species: "Dog",
    names: [
      "Biscuit",
      "Max",
      "Luna",
      "Bella",
      "Teddy",
      "Poppy",
      "Milo",
      "Rosie",
      "Bear",
      "Daisy",
      "Archie",
      "Willow",
    ],
    breeds: [
      "Labrador",
      "Cockapoo",
      "Border Collie",
      "French Bulldog",
      "Springer Spaniel",
      "Dachshund",
      "Greyhound",
    ],
    weight: [12, 85],
  },
  {
    species: "Cat",
    names: [
      "Mochi",
      "Smudge",
      "Tigger",
      "Nala",
      "Pepper",
      "Oreo",
      "Ginger",
      "Shadow",
      "Cleo",
      "Simba",
    ],
    breeds: ["Domestic shorthair", "Maine Coon", "British Shorthair", "Siamese", "Ragdoll"],
    weight: [7, 16],
  },
  {
    species: "Rabbit",
    names: ["Clover", "Thumper", "Hazel", "Bramble"],
    breeds: ["Lionhead", "Mini Lop", "Netherland Dwarf"],
    weight: [2, 7],
  },
  {
    species: "Bird",
    names: ["Kiwi", "Sunny", "Rio"],
    breeds: ["Budgerigar", "Cockatiel"],
    weight: [0.1, 0.3],
  },
];
const ALERTS = [
  "Bites when muzzled",
  "Allergic to penicillin",
  "Very anxious: quiet room",
  "Diabetic: insulin twice daily",
  "Heart murmur",
];
const REASON_WEIGHTS: [string, number][] = [
  ["Checkup", 30],
  ["Vaccination", 25],
  ["Follow-up", 15],
  ["Skin", 10],
  ["Lameness", 8],
  ["Dental", 7],
  ["Surgery", 5],
];
const STOCK: {
  sku: string;
  item: string;
  category: string;
  cost: number;
  reorderAt: number;
  qty: number;
}[] = [
  {
    sku: "VAC-DHPP",
    item: "Canine DHPP vaccine",
    category: "Vaccines",
    cost: 820,
    reorderAt: 20,
    qty: 60,
  },
  {
    sku: "VAC-LEPTO",
    item: "Leptospirosis vaccine",
    category: "Vaccines",
    cost: 640,
    reorderAt: 20,
    qty: 60,
  },
  {
    sku: "VAC-FEL",
    item: "Feline FVRCP vaccine",
    category: "Vaccines",
    cost: 710,
    reorderAt: 15,
    qty: 40,
  },
  {
    sku: "VAC-RHD2",
    item: "Rabbit RHDV2 vaccine",
    category: "Vaccines",
    cost: 1150,
    reorderAt: 6,
    qty: 20,
  },
  {
    sku: "MED-MELOX",
    item: "Meloxicam oral suspension 1.5 mg/mL, 32 mL",
    category: "Medicines",
    cost: 960,
    reorderAt: 10,
    qty: 30,
  },
  {
    sku: "MED-AMOX",
    item: "Amoxicillin 250 mg, 100 tablets",
    category: "Medicines",
    cost: 1480,
    reorderAt: 8,
    qty: 24,
  },
  {
    sku: "MED-INSUL",
    item: "Vetsulin 10 mL",
    category: "Medicines",
    cost: 4350,
    reorderAt: 4,
    qty: 12,
  },
  {
    sku: "ANA-ISO",
    item: "Isoflurane 250 mL",
    category: "Anaesthesia",
    cost: 6200,
    reorderAt: 3,
    qty: 10,
  },
  {
    sku: "ANA-PROP",
    item: "Propofol 20 mL",
    category: "Anaesthesia",
    cost: 1890,
    reorderAt: 6,
    qty: 20,
  },
  {
    sku: "SUP-GLOVE",
    item: "Nitrile gloves, box of 100",
    category: "Consumables",
    cost: 690,
    reorderAt: 15,
    qty: 50,
  },
  {
    sku: "SUP-SUTURE",
    item: "Absorbable sutures 3-0, box of 12",
    category: "Consumables",
    cost: 5400,
    reorderAt: 4,
    qty: 12,
  },
  {
    sku: "SUP-SYR",
    item: "Syringes 3 mL, box of 100",
    category: "Consumables",
    cost: 850,
    reorderAt: 10,
    qty: 40,
  },
  {
    sku: "FOOD-RENAL",
    item: "Renal diet, feline, 8.8 lb bag",
    category: "Diets",
    cost: 3150,
    reorderAt: 5,
    qty: 15,
  },
  {
    sku: "FOOD-GI",
    item: "Gastrointestinal diet, canine, 27.5 lb bag",
    category: "Diets",
    cost: 5620,
    reorderAt: 4,
    qty: 12,
  },
];
const EXTRAS: Record<string, number> = {
  Vaccination: 4800,
  Dental: 24000,
  Surgery: 49900,
  Lameness: 11500,
  Skin: 5200,
};
const FEE = 6500;

/**
 * Fills an empty workspace with six weeks of a veterinary group's life and the
 * next ten days of bookings. It refuses to run twice: delete the rows first.
 */
export const seedDemo = defineScript({
  path: "setup/seed-demo",
  description:
    "Fills an empty workspace with demo clinics, clients, pets, visits, invoices and stock.",
  input: z.object({
    clientsPerClinic: z.number().int().min(5).max(60).default(24),
    pastDays: z.number().int().min(7).max(90).default(42),
  }),
  output: z.object({ counts: z.record(z.string(), z.number()) }),
  tables: [
    clinics,
    clients,
    pets,
    appointments,
    invoices,
    inventory,
    purchaseOrders,
    registrations,
  ],
  timeoutSeconds: 600,
  concurrency: 1,
  async run(input, ctx) {
    if ((await ctx.table(clinics).find({ limit: 1 })).length > 0) {
      throw new Error("This workspace already has clinics. Seed only an empty workspace.");
    }
    const rnd = random(20261114);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T;
    const weighted = (list: [string, number][]) => {
      const total = list.reduce((sum, [, weight]) => sum + weight, 0);
      let at = rnd() * total;
      for (const [value, weight] of list) {
        at -= weight;
        if (at <= 0) return value;
      }
      return list[0]?.[0] as string;
    };
    const inChunks = async <Row>(rows: Row[], write: (chunk: Row[]) => Promise<unknown>) => {
      for (let at = 0; at < rows.length; at += 500) await write(rows.slice(at, at + 500));
    };

    await ctx.table(clinics).insertMany(CLINIC_ROWS);

    // Owners, numbered across the group, each registered at one clinic.
    const owners: { code: string; name: string; phone: string; clinic: string }[] = [];
    let number = 1001;
    for (const clinic of CLINIC_ROWS) {
      for (let i = 0; i < input.clientsPerClinic; i += 1) {
        const first = pick(FIRST);
        const last = pick(LAST);
        // A few numbers TextLine refuses, so reminders have something to report.
        // Numbers in 555-0100 to 0199 are set aside for fiction. 0199 is a landline TextLine refuses,
        // so reminders have something to report.
        const phone = number % 17 === 0 ? "(503) 555-0199" : `(503) 555-0${100 + (number - 1000)}`;
        owners.push({ code: `C-${number}`, name: `${first} ${last}`, phone, clinic: clinic.code });
        number += 1;
      }
    }
    await ctx.table(clients).insertMany(
      owners.map((owner, index) => ({
        code: owner.code,
        name: owner.name,
        email: `${owner.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.net`,
        phone: owner.phone,
        home_clinic: owner.clinic,
        notes: index % 11 === 0 ? "Prefers a call to a text." : null,
      })),
    );

    // One to three animals each.
    const petRows: NonNullable<typeof pets.__insert>[] = [];
    for (const owner of owners) {
      const count = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
      for (let i = 0; i < count; i += 1) {
        const kind = PETS[
          rnd() < 0.55 ? 0 : rnd() < 0.8 ? 1 : rnd() < 0.7 ? 2 : 3
        ] as (typeof PETS)[number];
        const age = 1 + Math.floor(rnd() * 13);
        const born = new Date(
          Date.UTC(2026 - age, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)),
        );
        const [low, high] = kind.weight;
        petRows.push({
          name: pick(kind.names),
          species: kind.species,
          breed: pick(kind.breeds),
          born: born.toISOString().slice(0, 10),
          weight_lb: Math.round((low + rnd() * (high - low)) * 10) / 10,
          client_code: owner.code,
          clinic: owner.clinic,
          alert: rnd() < 0.08 ? pick(ALERTS) : null,
        });
      }
    }
    const storedPets: {
      id: string;
      name: string;
      species: string;
      client_code: string;
      clinic: string;
    }[] = [];
    await inChunks(petRows, async (chunk) => {
      storedPets.push(...((await ctx.table(pets).insertMany(chunk)) as typeof storedPets));
    });
    const petsAt = (clinic: string) => storedPets.filter((pet) => pet.clinic === clinic);

    // Visits: the past weeks, today, and ten days ahead, by each clinic's own clock.
    const now = Date.now();
    const visitRows: NonNullable<typeof appointments.__insert>[] = [];
    let visitNumber = 4000;
    for (let day = -input.pastDays; day <= 10; day += 1) {
      const local = wallClock(new Date(now + day * 86_400_000), TIME_ZONE);
      for (const clinic of CLINIC_ROWS) {
        const hours = hoursOn(clinic, local.weekday);
        if (!hours) continue;
        const slots = Math.floor((hours.closes - hours.opens) / 20);
        const busy = day > 3 ? 0.25 : 0.45;
        for (let slot = 0; slot < slots; slot += 1) {
          for (const vet of VETS[clinic.code] ?? []) {
            if (rnd() > busy) continue;
            const pet = pick(petsAt(clinic.code));
            const startsAt = instantAt(local.date, hours.opens + slot * 20, TIME_ZONE);
            const reason = weighted(REASON_WEIGHTS);
            const minutes = VISIT_MINUTES[reason as Reason];
            const past = startsAt.getTime() + minutes * 60_000 < now;
            const started = startsAt.getTime() < now;
            let status = "booked";
            if (past) {
              const roll = rnd();
              status = roll < 0.08 ? "no_show" : roll < 0.14 ? "cancelled" : "done";
            } else if (started) {
              status = "in_exam";
            } else if (day === 0 && startsAt.getTime() - now < 40 * 60_000) {
              // Arrived early for the next visits of the day.
              status = rnd() < 0.6 ? "checked_in" : "booked";
            }
            visitRows.push({
              number: `A-${visitNumber}`,
              pet: pet.id,
              pet_name: pet.name,
              species: pet.species,
              client_code: pet.client_code,
              clinic: clinic.code,
              vet,
              starts_at: startsAt.toISOString(),
              minutes,
              reason,
              status,
              checked_in_at:
                status === "checked_in" || status === "in_exam" || status === "done"
                  ? new Date(startsAt.getTime() - Math.floor(rnd() * 15) * 60_000).toISOString()
                  : null,
              // Visits before tomorrow have had their reminder.
              reminded_at: day < 1 ? new Date(startsAt.getTime() - 86_400_000).toISOString() : null,
              notes: rnd() < 0.05 ? "Owner asked for a call with results." : null,
            });
            visitNumber += 1;
          }
        }
      }
    }
    const storedVisits: {
      id: string;
      number: string;
      status: string;
      reason: string;
      clinic: string;
      client_code: string;
      starts_at: string;
    }[] = [];
    await inChunks(visitRows, async (chunk) => {
      storedVisits.push(
        ...((await ctx.table(appointments).insertMany(chunk)) as typeof storedVisits),
      );
    });

    // An invoice for every finished visit. Older ones are mostly paid.
    let invoiceNumber = 9000;
    const invoiceRows = storedVisits
      .filter((visit) => visit.status === "done")
      .map((visit) => {
        const issued = wallClock(new Date(visit.starts_at), TIME_ZONE).date;
        const ageDays = (now - new Date(visit.starts_at).getTime()) / 86_400_000;
        const lines = [{ label: "Consultation", amount: FEE }];
        if (EXTRAS[visit.reason])
          lines.push({ label: visit.reason, amount: EXTRAS[visit.reason] as number });
        const total = lines.reduce((sum, line) => sum + line.amount, 0);
        const paid = rnd() < (ageDays > 14 ? 0.9 : ageDays > 2 ? 0.6 : 0.25);
        invoiceNumber += 1;
        return {
          number: `INV-${invoiceNumber}`,
          appointment: visit.id,
          client_code: visit.client_code,
          clinic: visit.clinic,
          total,
          status: paid ? "paid" : "unpaid",
          issued_on: issued,
          paid_at: paid
            ? new Date(new Date(visit.starts_at).getTime() + rnd() * 3 * 86_400_000).toISOString()
            : null,
          payment_ref: paid ? `pf_${Math.floor(rnd() * 1e10).toString(36)}` : null,
          lines,
        };
      });
    await inChunks(invoiceRows, (chunk) => ctx.table(invoices).insertMany(chunk));

    // Stock: each clinic holds every line. A few are low already.
    const stockRows = CLINIC_ROWS.flatMap((clinic) =>
      STOCK.map((line) => {
        const low = rnd() < 0.12;
        return {
          clinic: clinic.code,
          sku: line.sku,
          item: line.item,
          category: line.category,
          on_hand: low
            ? Math.floor(rnd() * line.reorderAt)
            : line.reorderAt + 2 + Math.floor(rnd() * line.qty),
          reorder_at: line.reorderAt,
          reorder_qty: line.qty,
          unit_cost: line.cost,
          reorder_pending: false,
        };
      }),
    );
    await ctx.table(inventory).insertMany(stockRows);

    // Orders the group placed before.
    const poRows = Array.from({ length: 14 }, (_, index) => {
      const line = pick(STOCK);
      const clinic = pick(CLINIC_ROWS);
      return {
        number: `PO-${7100 + index}`,
        clinic: clinic.code,
        sku: line.sku,
        item: line.item,
        quantity: line.qty,
        total: line.qty * line.cost,
        status: index === 3 ? "refused" : "placed",
        supplier_ref: index === 3 ? null : `VSD-${880000 + index * 37}`,
      };
    });
    await ctx.table(purchaseOrders).insertMany(poRows);

    await ctx.table(registrations).insertMany([
      {
        name: "Daniel Price",
        phone: "(503) 555-0181",
        email: "dan.price@example.net",
        pet_name: "Pickle",
        species: "Dog",
        clinic: "northside",
        status: "new",
      },
      {
        name: "Hana Sato",
        phone: "(503) 555-0182",
        email: null,
        pet_name: "Yuzu",
        species: "Cat",
        clinic: "riverside",
        status: "new",
      },
      {
        name: "Callum Reid",
        phone: "(503) 555-0183",
        email: "callum@example.net",
        pet_name: "Nibbles",
        species: "Rabbit",
        clinic: "hilltop",
        status: "called back",
      },
    ]);

    const counts = {
      clinics: CLINIC_ROWS.length,
      clients: owners.length,
      pets: storedPets.length,
      appointments: storedVisits.length,
      invoices: invoiceRows.length,
      inventory: stockRows.length,
      purchase_orders: poRows.length,
      registrations: 3,
    };
    ctx.log.info("Seeded", counts);
    return { counts };
  },
});
